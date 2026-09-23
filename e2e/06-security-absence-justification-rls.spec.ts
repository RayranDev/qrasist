import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { STUDENT_B, TEST_SUBJECT } from './seed/testUsers'

/**
 * Security regression for the self-approval hole closed in migration
 * 024 (see supabase/migrations/024_absence_justifications.sql): the
 * table has a SELECT policy but deliberately NO insert/update
 * policies, because a student calling PostgREST directly with their
 * own JWT (the anon key is public, so this is a real attack surface,
 * not a hypothetical) must never be able to create or self-approve a
 * justification -- that has to go through
 * submitJustification()/reviewJustification() (service role, with
 * eligibility + authorization checks it can't bypass).
 *
 * Self-contained: creates its own throwaway past session (not the
 * shared one from the seed/other specs, which already has an APPROVED
 * justification by the time this runs) so it never collides with the
 * UNIQUE(student_id, session_id) constraint regardless of run order,
 * and cleans it up at the end.
 */
test.describe('security: absence_justifications RLS', () => {
  test('a student cannot insert or approve their own justification via PostgREST', async ({
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

    const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    const studentB = users.users.find((u) => u.email === STUDENT_B.email)
    expect(studentB).toBeTruthy()

    // Arrange: a throwaway already-held session for this same subject,
    // just for this test.
    const sessionDate = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
    const { data: attackSession, error: sessionError } = await admin
      .from('sessions')
      .insert({
        subject_id: subject!.id,
        date: sessionDate.toISOString(),
        duration_minutes: 90,
        qr_token: crypto.randomUUID(),
        expires_at: new Date(sessionDate.getTime() + 15 * 60 * 1000).toISOString(),
        is_active: true,
      })
      .select('id')
      .single()
    expect(sessionError).toBeNull()

    try {
      // Sign in as the student the same way the browser would (password
      // grant against GoTrue), to get a real user JWT -- not the anon key.
      const tokenResponse = await request.post(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token`, {
        params: { grant_type: 'password' },
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { email: STUDENT_B.email, password: STUDENT_B.password },
      })
      expect(tokenResponse.ok()).toBeTruthy()
      const { access_token: studentAccessToken } = await tokenResponse.json()
      expect(studentAccessToken).toBeTruthy()

      const authHeaders = {
        apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${studentAccessToken}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      }

      // Attack 1: insert a brand-new justification, pre-approved.
      const insertResponse = await request.post(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/absence_justifications`,
        {
          headers: authHeaders,
          data: {
            student_id: studentB!.id,
            session_id: attackSession!.id,
            subject_id: subject!.id,
            reason: 'Auto-aprobacion via PostgREST directo (no deberia funcionar).',
            status: 'APPROVED',
          },
        }
      )
      expect(insertResponse.ok()).toBeFalsy()
      expect([400, 401, 403, 404]).toContain(insertResponse.status())

      const { data: leaked } = await admin
        .from('absence_justifications')
        .select('id')
        .eq('session_id', attackSession!.id)
        .eq('student_id', studentB!.id)
        .maybeSingle()
      expect(leaked).toBeNull()

      // Attack 2: create a legitimate PENDING justification the way the
      // app does (service role, as submitJustification() would), then
      // try to flip it to APPROVED directly as the student.
      const { data: legit, error: legitError } = await admin
        .from('absence_justifications')
        .insert({
          student_id: studentB!.id,
          session_id: attackSession!.id,
          subject_id: subject!.id,
          reason: 'Justificacion legitima creada por el test para el ataque 2.',
          status: 'PENDING',
        })
        .select('id')
        .single()
      expect(legitError).toBeNull()

      const updateResponse = await request.patch(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/absence_justifications?id=eq.${legit!.id}`,
        {
          headers: authHeaders,
          data: { status: 'APPROVED' },
        }
      )
      // Unlike a blocked INSERT (which PostgREST rejects outright with
      // 401/403), an UPDATE with no matching RLS policy comes back as
      // HTTP 200 with an EMPTY array: RLS filters the row out of what
      // the student is allowed to update, so PostgREST just sees zero
      // matching rows -- it's not an error from its point of view. The
      // real assertion has to be "no row was actually changed", not
      // the HTTP status. Verified manually against the local stack
      // before writing this (see PR notes).
      if (updateResponse.ok()) {
        const body = await updateResponse.json()
        expect(Array.isArray(body) ? body.length : 0).toBe(0)
      } else {
        expect([400, 401, 403, 404]).toContain(updateResponse.status())
      }

      const { data: stillPending } = await admin
        .from('absence_justifications')
        .select('status')
        .eq('id', legit!.id)
        .single()
      expect(stillPending?.status).toBe('PENDING')
    } finally {
      // ON DELETE CASCADE on absence_justifications.session_id takes
      // the attack rows with it.
      await admin.from('sessions').delete().eq('id', attackSession!.id)
    }
  })
})
