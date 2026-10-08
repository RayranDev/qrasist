import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { PROFESSOR_USER, TEST_SUBJECT } from './seed/testUsers'

/**
 * Security regression for migration 028 (drops `sessions_professor_write`).
 *
 * That policy was FOR ALL for the owning professor, so with their own JWT
 * (the anon key is public, this is a real attack surface) they could call
 * PostgREST directly and: move class_ends_at/date of a past session to
 * reopen the RF21 edit window, insert sessions with arbitrary dates, or
 * delete sessions (cascading to their attendances). Every professor
 * session write now goes through server actions with the service role,
 * after an application-level check.
 *
 * Self-contained: uses its own throwaway closed session and cleans up.
 */
test.describe('security: sessions have no professor write policy', () => {
  test('a professor JWT cannot update, insert or delete sessions via PostgREST', async ({
    request,
  }) => {
    const env = getLocalSupabaseEnv()
    const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: subject } = await admin
      .from('subjects')
      .select('id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()

    const startedAt = new Date(Date.now() - 5 * 60 * 60 * 1000)
    const classEndsAt = new Date(startedAt.getTime() + 2 * 60 * 60 * 1000).toISOString()
    const { data: session, error } = await admin
      .from('sessions')
      .insert({
        subject_id: subject!.id,
        date: startedAt.toISOString(),
        duration_minutes: 5,
        qr_token: null,
        expires_at: new Date(startedAt.getTime() + 5 * 60 * 1000).toISOString(),
        class_ends_at: classEndsAt,
        is_active: true,
      })
      .select('id')
      .single()
    expect(error).toBeNull()

    const insertedByAttack: string[] = []

    try {
      const tokenResponse = await request.post(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token`, {
        params: { grant_type: 'password' },
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { email: PROFESSOR_USER.email, password: PROFESSOR_USER.password },
      })
      expect(tokenResponse.ok()).toBeTruthy()
      const { access_token: professorToken } = await tokenResponse.json()
      expect(professorToken).toBeTruthy()

      const headers = {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${professorToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }
      const restUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sessions`

      // Sanity: the professor can still READ their own subject's sessions.
      const readResponse = await request.get(`${restUrl}?id=eq.${session!.id}&select=id`, {
        headers,
      })
      expect(readResponse.ok()).toBeTruthy()
      expect(await readResponse.json()).toHaveLength(1)

      // Attack 1: push class_ends_at into the future to reopen the edit window.
      const reopened = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      const updateResponse = await request.patch(`${restUrl}?id=eq.${session!.id}`, {
        headers,
        data: { class_ends_at: reopened },
      })
      // PostgREST answers 2xx with zero affected rows when RLS hides the
      // write, or an error status -- either way the row must not change.
      if (updateResponse.ok()) expect(await updateResponse.json()).toEqual([])
      const { data: afterUpdate } = await admin
        .from('sessions')
        .select('class_ends_at')
        .eq('id', session!.id)
        .single()
      expect(new Date(afterUpdate!.class_ends_at).toISOString()).toBe(classEndsAt)

      // Attack 2: insert a session with an arbitrary date.
      const insertResponse = await request.post(restUrl, {
        headers,
        data: {
          subject_id: subject!.id,
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          expires_at: new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString(),
          duration_minutes: 5,
          is_active: true,
        },
      })
      expect(insertResponse.ok()).toBeFalsy()
      expect([401, 403]).toContain(insertResponse.status())
      const { data: leaked } = await admin
        .from('sessions')
        .select('id')
        .eq('subject_id', subject!.id)
        .eq('duration_minutes', 5)
        .lt('date', new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString())
      for (const row of leaked || []) insertedByAttack.push(row.id)
      expect(leaked || []).toHaveLength(0)

      // Attack 3: delete the session (would cascade to its attendances).
      const deleteResponse = await request.delete(`${restUrl}?id=eq.${session!.id}`, { headers })
      if (deleteResponse.ok()) expect(await deleteResponse.json()).toEqual([])
      const { data: stillThere } = await admin
        .from('sessions')
        .select('id')
        .eq('id', session!.id)
        .maybeSingle()
      expect(stillThere).not.toBeNull()
    } finally {
      for (const id of insertedByAttack) await admin.from('sessions').delete().eq('id', id)
      await admin.from('sessions').delete().eq('id', session!.id)
    }
  })
})
