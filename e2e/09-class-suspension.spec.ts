import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loginAs } from './utils/auth'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { ADMIN_USER, PROFESSOR_USER, STUDENT_B, TEST_SUBJECT } from './seed/testUsers'
import { isColombianHoliday } from '../src/lib/utils/colombianHolidays'

// RF20 (class suspension) and RF22 (justification of an unregistered class).
//
// Self-contained like 07/08: each test arranges its own rows with the
// service role (session, schedule block, period dates) and removes or
// restores them in `finally`, so the seeded session the student specs
// depend on is never touched.

const DAY_MS = 24 * 60 * 60 * 1000

function serviceClient() {
  const env = getLocalSupabaseEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** Calendar date in Bogota (UTC-5, no DST) of an instant, as YYYY-MM-DD. */
function bogotaDate(instant: Date): string {
  return new Date(instant.getTime() - 5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function bogotaWeekday(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay()
}

// One class per subject and day: spec 02 leaves a live class open today, so
// clear today's classes of the seeded subject before each test here (this is
// the last spec, nothing after it depends on them).
test.beforeEach(async () => {
  const admin = serviceClient()
  const { data: subject } = await admin
    .from('subjects')
    .select('id')
    .eq('code', TEST_SUBJECT.code)
    .single()
  const today = bogotaDate(new Date())
  await admin
    .from('sessions')
    .delete()
    .eq('subject_id', subject!.id)
    .gte('date', new Date(`${today}T00:00:00-05:00`).toISOString())
    .lte('date', new Date(`${today}T23:59:59.999-05:00`).toISOString())
})

async function studentStatusLine(page: Page): Promise<string> {
  await page.goto('/student/history')
  const line = page.getByText(/falta.*de \d+ permitidas/)
  await expect(line).toBeVisible()
  return (await line.textContent()) ?? ''
}

test.describe('class suspension (RF20)', () => {
  test('professor suspends a running class: it stops counting and nobody gets an absence', async ({
    page,
    browser,
  }) => {
    const admin = serviceClient()
    const { data: subject } = await admin
      .from('subjects')
      .select('id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()
    const { data: studentB } = await admin
      .from('profiles')
      .select('id')
      .eq('email', STUDENT_B.email)
      .single()
    expect(studentB).toBeTruthy()

    const countHeld = async () => {
      const { count } = await admin
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('subject_id', subject!.id)
        .eq('is_active', true)
      return count ?? 0
    }

    let sessionId: string | null = null
    const studentContext = await browser.newContext()
    const studentPage = await studentContext.newPage()

    try {
      // Baseline: what student B sees before the class exists.
      await loginAs(studentPage, STUDENT_B.email, STUDENT_B.password)
      const lineBefore = await studentStatusLine(studentPage)
      const heldBefore = await countHeld()

      // Professor opens attendance from the subject card.
      await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
      await page.getByRole('button', { name: 'Iniciar Sesión (Generar QR)' }).click()
      await page.waitForURL(/\/professor\/session\//)
      sessionId = new URL(page.url()).pathname.split('/').pop()!
      await expect(page.getByText('Código activo en rotación antifraude')).toBeVisible()
      expect(await countHeld()).toBe(heldBefore + 1)

      // Student B already scanned before the power went out.
      const { error: attendanceError } = await admin.from('attendances').insert({
        session_id: sessionId,
        student_id: studentB!.id,
        scanned_at: new Date().toISOString(),
        status: 'PRESENT',
      })
      expect(attendanceError).toBeNull()

      // Professor suspends the class: reason is mandatory.
      await page.getByRole('button', { name: 'Suspender clase' }).click()
      const modal = page.getByRole('dialog')
      await expect(modal.getByText(/no se generarán inasistencias/i)).toBeVisible()
      const confirm = modal.getByRole('button', { name: 'Suspender clase' })
      await expect(confirm).toBeDisabled()
      await modal.getByLabel(/Motivo/).fill('Corte de energía en el edificio.')
      await confirm.click()

      await expect(page.getByRole('heading', { name: 'Clase suspendida' })).toBeVisible()
      await expect(page.getByText('Corte de energía en el edificio.')).toBeVisible()
      // The live QR is gone.
      await expect(page.getByText('Código activo en rotación antifraude')).toHaveCount(0)

      // Database: not held, QR closed, reason + actor recorded, attendance kept.
      const { data: row } = await admin
        .from('sessions')
        .select('is_active, suspended_at, suspended_by, suspension_reason, qr_token')
        .eq('id', sessionId)
        .single()
      expect(row).toMatchObject({
        is_active: false,
        suspension_reason: 'Corte de energía en el edificio.',
        qr_token: null,
      })
      expect(row!.suspended_at).toBeTruthy()
      expect(row!.suspended_by).toBeTruthy()
      expect(await countHeld()).toBe(heldBefore)

      const { count: keptAttendances } = await admin
        .from('attendances')
        .select('id', { count: 'exact', head: true })
        .eq('session_id', sessionId)
      expect(keptAttendances).toBe(1)

      const { data: audit } = await admin
        .from('audit_log')
        .select('action, details')
        .eq('entity_id', sessionId)
        .eq('action', 'session.suspend')
      expect(audit).toHaveLength(1)

      // Student B scanned it, yet the suspended class gives no credit and no new absence.
      expect(await studentStatusLine(studentPage)).toBe(lineBefore)

      // The professor cannot open attendance again that day.
      await page.goto('/professor/subjects')
      await expect(page.getByText('La clase de hoy está suspendida')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Iniciar Sesión (Generar QR)' })).toHaveCount(0)

      // Coordination sees it flagged and can undo the suspension.
      const adminContext = await browser.newContext()
      const adminPage = await adminContext.newPage()
      try {
        await loginAs(adminPage, ADMIN_USER.email, ADMIN_USER.password)
        await adminPage.goto(`/admin/attendance?subjectId=${subject!.id}&sessionId=${sessionId}`)
        await expect(adminPage.getByText('Suspendida', { exact: true })).toBeVisible()
        await expect(
          adminPage.getByText('Corte de energía en el edificio.', { exact: true })
        ).toBeVisible()
        await expect(
          adminPage.getByText('Clase suspendida: no se registra asistencia.')
        ).toBeVisible()

        await adminPage.getByRole('button', { name: 'Deshacer suspensión' }).click()
        await adminPage
          .getByRole('dialog')
          .getByRole('button', { name: 'Deshacer suspensión' })
          .click()
        await expect(adminPage.getByText('Suspensión deshecha.')).toBeVisible()

        const { data: restored } = await admin
          .from('sessions')
          .select('is_active, suspended_at, suspension_reason')
          .eq('id', sessionId)
          .single()
        expect(restored).toEqual({ is_active: true, suspended_at: null, suspension_reason: null })
        expect(await countHeld()).toBe(heldBefore + 1)
      } finally {
        await adminContext.close()
      }
    } finally {
      // ON DELETE CASCADE takes the attendance rows with the session.
      if (sessionId) await admin.from('sessions').delete().eq('id', sessionId)
      await studentContext.close()
    }
  })

  test("professor suspends today's scheduled class before it has a session", async ({ page }) => {
    const admin = serviceClient()
    const { data: subject } = await admin
      .from('subjects')
      .select('id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()

    const today = bogotaDate(new Date())
    const { data: block, error: blockError } = await admin
      .from('subject_schedules')
      .insert({
        subject_id: subject!.id,
        day_of_week: bogotaWeekday(today),
        start_time: '06:00',
        end_time: '07:00',
        modality: 'PRESENCIAL',
      })
      .select('id')
      .single()
    expect(blockError).toBeNull()

    try {
      await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
      await page.getByRole('button', { name: 'Suspender clase de hoy' }).click()
      const modal = page.getByRole('dialog')
      await modal.getByLabel(/Motivo/).fill('Paro de transporte, no hay condiciones.')
      await modal.getByRole('button', { name: 'Suspender clase' }).click()

      await expect(page.getByText('La clase de hoy está suspendida')).toBeVisible()

      const { data: placeholders } = await admin
        .from('sessions')
        .select('id, is_active, qr_token, suspended_at, suspension_reason, date')
        .eq('subject_id', subject!.id)
        .not('suspended_at', 'is', null)
      expect(placeholders).toHaveLength(1)
      expect(placeholders![0]).toMatchObject({
        is_active: false,
        qr_token: null,
        suspension_reason: 'Paro de transporte, no hay condiciones.',
        // starts at the schedule block (06:00 Bogota = 11:00 UTC)
        date: `${today}T11:00:00+00:00`,
      })
    } finally {
      await admin
        .from('sessions')
        .delete()
        .eq('subject_id', subject!.id)
        .not('suspended_at', 'is', null)
      await admin.from('subject_schedules').delete().eq('id', block!.id)
    }
  })
})

test.describe('unregistered classes (RF22)', () => {
  test('professor justifies a class with no session and coordination sees the reason', async ({
    page,
    browser,
  }) => {
    const admin = serviceClient()
    const { data: subject } = await admin
      .from('subjects')
      .select('id, period_id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()
    const { data: period } = await admin
      .from('periods')
      .select('id, start_date, end_date')
      .eq('id', subject!.period_id)
      .single()
    expect(period).toBeTruthy()

    // A recent weekday that is not a holiday, not a Sunday and has no session
    // yet (the seeded class sits a couple of days back), so the schedule block
    // below produces exactly one due, uncovered class.
    const { data: existingSessions } = await admin
      .from('sessions')
      .select('date')
      .eq('subject_id', subject!.id)
    const coveredDays = new Set((existingSessions || []).map((s) => bogotaDate(new Date(s.date))))
    const now = new Date()
    const isUsable = (offsetDays: number) => {
      const day = bogotaDate(new Date(now.getTime() - offsetDays * DAY_MS))
      return !isColombianHoliday(day) && bogotaWeekday(day) !== 0 && !coveredDays.has(day)
    }
    let offset = 3
    while (offset < 8 && !isUsable(offset)) offset++
    expect(offset).toBeLessThan(8)
    const pastDate = bogotaDate(new Date(now.getTime() - offset * DAY_MS))

    // The seeded period ended months ago: stretch it around "now" for this
    // test and restore it afterwards.
    await admin
      .from('periods')
      .update({
        start_date: bogotaDate(new Date(now.getTime() - 9 * DAY_MS)),
        end_date: bogotaDate(new Date(now.getTime() + 60 * DAY_MS)),
      })
      .eq('id', period!.id)

    const { data: block, error: blockError } = await admin
      .from('subject_schedules')
      .insert({
        subject_id: subject!.id,
        day_of_week: bogotaWeekday(pastDate),
        start_time: '06:00',
        end_time: '07:00',
        modality: 'PRESENCIAL',
        created_at: new Date(now.getTime() - 12 * DAY_MS).toISOString(),
      })
      .select('id')
      .single()
    expect(blockError).toBeNull()

    const adminContext = await browser.newContext()
    try {
      await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)
      const summary = page.getByRole('button', { name: /sin registrar/ })
      await expect(summary).toBeVisible()
      await summary.click()

      await page.getByRole('button', { name: 'Justificar' }).first().click()
      const modal = page.getByRole('dialog')
      await expect(modal.getByText(/llega a coordinación/)).toBeVisible()
      const send = modal.getByRole('button', { name: 'Enviar justificación' })
      await expect(send).toBeDisabled()
      await modal.getByLabel(/Motivo/).fill('Cita médica urgente, avisé a coordinación.')
      await send.click()

      await expect(page.getByText('Justificada').first()).toBeVisible()
      await expect(page.getByText('Cita médica urgente, avisé a coordinación.')).toBeVisible()

      const { data: justified } = await admin
        .from('class_omissions')
        .select('class_date, reason, submitted_by, schedule_id')
        .eq('subject_id', subject!.id)
      expect(justified).toHaveLength(1)
      expect(justified![0]).toMatchObject({
        reason: 'Cita médica urgente, avisé a coordinación.',
        schedule_id: block!.id,
      })

      // Coordination sees the justification and the reason.
      const adminPage = await adminContext.newPage()
      await loginAs(adminPage, ADMIN_USER.email, ADMIN_USER.password)
      await adminPage.goto('/admin/omissions?status=justified')
      await expect(adminPage.getByText('Cita médica urgente, avisé a coordinación.')).toBeVisible()
      await expect(adminPage.getByText('Justificada', { exact: true }).first()).toBeVisible()
    } finally {
      await adminContext.close()
      await admin.from('class_omissions').delete().eq('subject_id', subject!.id)
      await admin.from('subject_schedules').delete().eq('id', block!.id)
      await admin
        .from('periods')
        .update({ start_date: period!.start_date, end_date: period!.end_date })
        .eq('id', period!.id)
    }
  })
})

test.describe('security: omissions are written only through server actions', () => {
  test('a professor JWT can read but not write class_omissions via PostgREST', async ({
    request,
  }) => {
    const env = getLocalSupabaseEnv()
    const admin = serviceClient()
    const { data: subject } = await admin
      .from('subjects')
      .select('id')
      .eq('code', TEST_SUBJECT.code)
      .single()
    expect(subject).toBeTruthy()

    const tokenResponse = await request.post(`${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token`, {
      params: { grant_type: 'password' },
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      data: { email: PROFESSOR_USER.email, password: PROFESSOR_USER.password },
    })
    expect(tokenResponse.ok()).toBeTruthy()
    const { access_token: token } = await tokenResponse.json()

    const headers = {
      apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    }
    const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/class_omissions`

    // Reading the own subject's justifications is allowed (RLS select policy).
    const read = await request.get(`${url}?subject_id=eq.${subject!.id}&select=id`, { headers })
    expect(read.ok()).toBeTruthy()

    // Forging a justification directly is not: no INSERT policy exists.
    const insert = await request.post(url, {
      headers,
      data: { subject_id: subject!.id, class_date: '2026-01-05', reason: 'Justificación forjada' },
    })
    expect(insert.ok()).toBeFalsy()
    expect([401, 403]).toContain(insert.status())

    const { data: forged } = await admin
      .from('class_omissions')
      .select('id')
      .eq('subject_id', subject!.id)
    expect(forged || []).toHaveLength(0)
  })
})
