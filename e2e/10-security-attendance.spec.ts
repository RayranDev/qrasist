import { test, expect, type APIRequestContext } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { loginAs } from './utils/auth'
import { ADMIN_USER, PROFESSOR_USER, STUDENT_A, STUDENT_B, TEST_SUBJECT } from './seed/testUsers'

/**
 * Security regression for migrations 031 and 032 plus the page-level role
 * guards (DEF-QA-01, -02, -03).
 *
 * The anon key is public, so every student/professor can call PostgREST
 * directly with their own JWT. Before 031 a student could:
 *   - INSERT their own attendance (no QR, no window, any past class);
 *   - read sessions.qr_token / previous_qr_token of their subjects and pass
 *     the QR check without being in class.
 * Before 032 any professor could read every student profile.
 *
 * Self-contained: creates a throwaway open session and a throwaway student
 * and removes them at the end.
 */

const SECRET_COLUMNS = ['qr_token', 'previous_qr_token']

function getAdmin() {
  const env = getLocalSupabaseEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function signIn(
  request: APIRequestContext,
  credentials: { email: string; password: string }
): Promise<{ token: string; id: string }> {
  const env = getLocalSupabaseEnv()
  const response = await request.post(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token`, {
    params: { grant_type: 'password' },
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    data: credentials,
  })
  expect(response.ok()).toBeTruthy()
  const body = await response.json()
  expect(body.access_token).toBeTruthy()
  return { token: body.access_token, id: body.user.id }
}

function restHeaders(token: string, extra: Record<string, string> = {}) {
  const env = getLocalSupabaseEnv()
  return {
    apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

async function createOpenSession(admin: SupabaseClient) {
  const { data: subject } = await admin
    .from('subjects')
    .select('id')
    .eq('code', TEST_SUBJECT.code)
    .single()
  expect(subject).toBeTruthy()

  const now = Date.now()
  const { data: session, error } = await admin
    .from('sessions')
    .insert({
      subject_id: subject!.id,
      date: new Date(now - 60_000).toISOString(),
      duration_minutes: 5,
      qr_token: crypto.randomUUID(),
      previous_qr_token: crypto.randomUUID(),
      expires_at: new Date(now + 5 * 60_000).toISOString(),
      class_ends_at: new Date(now + 60 * 60_000).toISOString(),
      is_active: true,
    })
    .select('id, qr_token')
    .single()
  expect(error).toBeNull()
  return {
    subjectId: subject!.id as string,
    sessionId: session!.id as string,
    token: session!.qr_token as string,
  }
}

test.describe('security: attendances cannot be inserted directly', () => {
  test('a student JWT cannot INSERT into attendances via PostgREST', async ({ request }) => {
    const env = getLocalSupabaseEnv()
    const admin = getAdmin()
    const { sessionId } = await createOpenSession(admin)

    try {
      const student = await signIn(request, STUDENT_B)

      const response = await request.post(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/attendances`, {
        headers: restHeaders(student.token, { Prefer: 'return=representation' }),
        data: { session_id: sessionId, student_id: student.id, status: 'PRESENT' },
      })
      expect(response.ok()).toBeFalsy()
      expect([401, 403]).toContain(response.status())

      const { data: rows } = await admin
        .from('attendances')
        .select('id')
        .eq('session_id', sessionId)
        .eq('student_id', student.id)
      expect(rows || []).toHaveLength(0)
    } finally {
      await admin.from('sessions').delete().eq('id', sessionId)
    }
  })

  test('a student JWT cannot UPDATE or DELETE attendances either', async ({ request }) => {
    const env = getLocalSupabaseEnv()
    const admin = getAdmin()
    const student = await signIn(request, STUDENT_A)

    const { data: own } = await admin
      .from('attendances')
      .select('id, status')
      .eq('student_id', student.id)
      .limit(1)
      .single()
    expect(own).toBeTruthy()

    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/attendances?id=eq.${own!.id}`
    const patch = await request.patch(url, {
      headers: restHeaders(student.token, { Prefer: 'return=representation' }),
      data: { status: 'LATE' },
    })
    if (patch.ok()) expect(await patch.json()).toEqual([])
    const del = await request.delete(url, {
      headers: restHeaders(student.token, { Prefer: 'return=representation' }),
    })
    if (del.ok()) expect(await del.json()).toEqual([])

    const { data: after } = await admin
      .from('attendances')
      .select('id, status')
      .eq('id', own!.id)
      .maybeSingle()
    expect(after).toEqual(own)
  })
})

test.describe('security: QR tokens are not readable by users', () => {
  test('students and professors cannot select qr_token / previous_qr_token', async ({
    request,
  }) => {
    const env = getLocalSupabaseEnv()
    const admin = getAdmin()
    const { sessionId, token } = await createOpenSession(admin)

    try {
      const restUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sessions`

      for (const user of [STUDENT_A, PROFESSOR_USER]) {
        const { token: jwt } = await signIn(request, user)
        const headers = restHeaders(jwt)

        for (const select of ['qr_token', 'previous_qr_token', 'id,qr_token', '*']) {
          const response = await request.get(`${restUrl}?id=eq.${sessionId}&select=${select}`, {
            headers,
          })
          expect(response.ok(), `${user.email} select=${select}`).toBeFalsy()
          expect([401, 403]).toContain(response.status())
          expect(await response.text()).not.toContain(token)
        }

        // Filtering by the secret column must not work as an oracle either.
        const oracle = await request.get(`${restUrl}?qr_token=eq.${token}&select=id`, { headers })
        expect(oracle.ok()).toBeFalsy()

        // Everything else stays readable (the app needs it).
        const readable = await request.get(
          `${restUrl}?id=eq.${sessionId}&select=id,subject_id,date,expires_at,is_active`,
          { headers }
        )
        expect(readable.ok()).toBeTruthy()
        expect(await readable.json()).toHaveLength(1)
      }

      // The service role (server code) still sees the token.
      const { data: serverRead } = await admin
        .from('sessions')
        .select('qr_token')
        .eq('id', sessionId)
        .single()
      expect(serverRead!.qr_token).toBe(token)
    } finally {
      await admin.from('sessions').delete().eq('id', sessionId)
    }
  })

  test('every non-secret sessions column stays granted (new columns must be granted in their migration)', async ({
    request,
  }) => {
    const env = getLocalSupabaseEnv()
    const admin = getAdmin()
    const { sessionId } = await createOpenSession(admin)

    try {
      const { data: row } = await admin.from('sessions').select('*').eq('id', sessionId).single()
      const columns = Object.keys(row!).filter((c) => !SECRET_COLUMNS.includes(c))
      expect(columns.length).toBeGreaterThan(10)

      const { token } = await signIn(request, STUDENT_A)
      const response = await request.get(
        `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/sessions?id=eq.${sessionId}&select=${columns.join(',')}`,
        { headers: restHeaders(token) }
      )
      expect(
        response.ok(),
        `a sessions column is not granted to authenticated: ${await response.text()}`
      ).toBeTruthy()
    } finally {
      await admin.from('sessions').delete().eq('id', sessionId)
    }
  })
})

test.describe('security: professors only read profiles of their own students', () => {
  test('an unrelated student is invisible, related students and self are visible', async ({
    request,
  }) => {
    const env = getLocalSupabaseEnv()
    const admin = getAdmin()

    const stranger = {
      email: `ajeno.${Date.now()}.e2e@urepublicana.edu.co`,
      password: 'StrangerE2E123!',
    }
    const { data: created, error } = await admin.auth.admin.createUser({
      email: stranger.email,
      password: stranger.password,
      email_confirm: true,
      user_metadata: { first_name: 'Ajeno', last_name: 'E2E' },
    })
    expect(error).toBeNull()
    const strangerId = created.user!.id

    try {
      for (let i = 0; i < 20; i++) {
        const { data } = await admin
          .from('profiles')
          .select('id')
          .eq('id', strangerId)
          .maybeSingle()
        if (data) break
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      const professor = await signIn(request, PROFESSOR_USER)
      const studentA = await signIn(request, STUDENT_A)
      const headers = restHeaders(professor.token)
      const profilesUrl = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles`

      const unrelated = await request.get(`${profilesUrl}?id=eq.${strangerId}&select=id,email`, {
        headers,
      })
      expect(unrelated.ok()).toBeTruthy()
      expect(await unrelated.json()).toEqual([])

      // Listing every student returns only the ones tied to the professor.
      const all = await request.get(`${profilesUrl}?role=eq.STUDENT&select=id`, { headers })
      expect(all.ok()).toBeTruthy()
      const visibleIds = ((await all.json()) as { id: string }[]).map((r) => r.id)
      expect(visibleIds).not.toContain(strangerId)
      expect(visibleIds).toContain(studentA.id)

      // Own profile still readable.
      const self = await request.get(`${profilesUrl}?id=eq.${professor.id}&select=id`, { headers })
      expect(await self.json()).toHaveLength(1)

      // Once the stranger enrolls in the professor's subject they become visible.
      const { data: subject } = await admin
        .from('subjects')
        .select('id')
        .eq('code', TEST_SUBJECT.code)
        .single()
      await admin.from('enrollments').insert({ subject_id: subject!.id, student_id: strangerId })
      const afterEnroll = await request.get(`${profilesUrl}?id=eq.${strangerId}&select=id`, {
        headers,
      })
      expect(await afterEnroll.json()).toHaveLength(1)
    } finally {
      await admin.from('enrollments').delete().eq('student_id', strangerId)
      await admin.auth.admin.deleteUser(strangerId)
    }
  })

  test('a student still reads only their own profile', async ({ request }) => {
    const env = getLocalSupabaseEnv()
    const studentA = await signIn(request, STUDENT_A)

    const response = await request.get(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/profiles?select=id`,
      {
        headers: restHeaders(studentA.token),
      }
    )
    expect(response.ok()).toBeTruthy()
    expect(await response.json()).toEqual([{ id: studentA.id }])
  })
})

test.describe('security: page-level role guards', () => {
  test('a STUDENT cannot open coordination or professor screens', async ({ page }) => {
    await loginAs(page, STUDENT_A.email, STUDENT_A.password)

    for (const path of [
      '/admin/users',
      '/admin/subjects',
      '/admin/academic',
      '/admin/dashboard',
      '/professor/subjects',
      '/professor/history',
    ]) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/student\/scanner/)
    }
  })

  test('a PROFESSOR cannot open coordination screens', async ({ page }) => {
    await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)

    for (const path of ['/admin/users', '/admin/subjects', '/admin/academic']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(/\/professor\/subjects/)
    }
  })

  test('an ADMIN still opens coordination screens', async ({ page }) => {
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password)

    for (const path of ['/admin/users', '/admin/subjects', '/admin/academic']) {
      await page.goto(path)
      await expect(page, path).toHaveURL(new RegExp(path))
    }
  })
})
