import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { loginAs } from './utils/auth'
import { getLocalSupabaseEnv } from './utils/supabaseLocal'
import { ADMIN_USER, PROFESSOR_USER, TEST_CAREER, TEST_SUBJECT } from './seed/testUsers'

// Self-contained: arranges its own professor, subjects, students and PENDING
// requests through the service role (the same rows requestEnrollment() would
// insert) and removes them at the end. Every student shares a unique last
// name (`R<timestamp>`), so searching for it isolates this spec's requests
// from anything else in the shared local database.
//
// Layout (student -> subject):
//   s1 -> ALG-E2E (seeded subject of the seeded professor)
//   s2 -> ALG-E2E
//   s3 -> MIA (second subject of the seeded professor)
//   s1, s2, s3 -> OTR (subject of ANOTHER professor)
const stamp = Date.now()
const lastName = `R${stamp}`
const students = ['A', 'B', 'C'].map((letter) => ({
  email: `solicitante.${letter.toLowerCase()}.${stamp}@urepublicana.edu.co`,
  password: 'SolicitanteE2E123!',
  firstName: `Sol${letter}`,
  lastName,
  fullName: `Sol${letter} ${lastName}`,
}))
const [s1, s2, s3] = students
const otherProfessor = {
  email: `profesor.otro.${stamp}@urepublicana.edu.co`,
  password: 'ProfesorOtroE2E123!',
  firstName: 'Otro',
  lastName: `P${stamp}`,
}
const MINE = { name: TEST_SUBJECT.name, code: TEST_SUBJECT.code }
const MIA = { name: `Materia Mía ${stamp}`, code: `MIA-${stamp}` }
const OTR = { name: `Materia Otra ${stamp}`, code: `OTR-${stamp}` }

function getAdmin() {
  const env = getLocalSupabaseEnv()
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function createUser(
  admin: SupabaseClient,
  user: { email: string; password: string; firstName: string; lastName: string }
) {
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: user.password,
    email_confirm: true,
    user_metadata: { first_name: user.firstName, last_name: user.lastName },
  })
  if (error || !data.user) throw error || new Error(`No se pudo crear a ${user.email}`)
  // El profile lo crea el trigger handle_new_user de forma asíncrona.
  for (let i = 0; i < 20; i++) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id')
      .eq('id', data.user.id)
      .maybeSingle()
    if (profile) return data.user.id
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`El profile de ${user.email} nunca apareció.`)
}

const ids = {
  careerId: '',
  otherProfessorId: '',
  studentIds: [] as string[],
  subjectIds: {} as Record<'mine' | 'mia' | 'otr', string>,
  requestIds: {} as Record<string, string>,
}

test.describe('enrollment requests', () => {
  test.describe.configure({ mode: 'serial' })

  test.beforeAll(async () => {
    const admin = getAdmin()

    const { data: career } = await admin
      .from('careers')
      .select('id')
      .eq('code', TEST_CAREER.code)
      .single()
    const { data: mine } = await admin
      .from('subjects')
      .select('id, professor_id, period_id')
      .eq('code', MINE.code)
      .single()
    expect(career && mine).toBeTruthy()
    ids.careerId = career!.id
    ids.subjectIds.mine = mine!.id

    ids.otherProfessorId = await createUser(admin, otherProfessor)
    await admin
      .from('profiles')
      .update({ role: 'PROFESSOR', is_active: true })
      .eq('id', ids.otherProfessorId)

    for (const [key, subject, professorId] of [
      ['mia', MIA, mine!.professor_id],
      ['otr', OTR, ids.otherProfessorId],
    ] as const) {
      const { data: created, error } = await admin
        .from('subjects')
        .insert({
          name: subject.name,
          code: subject.code,
          professor_id: professorId,
          period_id: mine!.period_id,
          is_active: true,
        })
        .select('id')
        .single()
      expect(error).toBeNull()
      ids.subjectIds[key] = created!.id
      await admin
        .from('subject_careers')
        .insert({ subject_id: created!.id, career_id: ids.careerId, level: 1, is_active: true })
    }

    for (const student of students) {
      const id = await createUser(admin, student)
      ids.studentIds.push(id)
      await admin
        .from('student_careers')
        .insert({ student_id: id, career_id: ids.careerId, is_active: true })
    }

    const plan: [string, number, 'mine' | 'mia' | 'otr'][] = [
      ['s1-mine', 0, 'mine'],
      ['s2-mine', 1, 'mine'],
      ['s3-mia', 2, 'mia'],
      ['s1-otr', 0, 'otr'],
      ['s2-otr', 1, 'otr'],
      ['s3-otr', 2, 'otr'],
    ]
    for (const [label, studentIndex, subjectKey] of plan) {
      const { data, error } = await admin
        .from('enrollment_requests')
        .insert({
          student_id: ids.studentIds[studentIndex],
          subject_id: ids.subjectIds[subjectKey],
          status: 'pending',
        })
        .select('id')
        .single()
      expect(error).toBeNull()
      ids.requestIds[label] = data!.id
    }
  })

  test.afterAll(async () => {
    const admin = getAdmin()
    // ON DELETE CASCADE lleva las solicitudes y las inscripciones de estas materias.
    for (const id of [ids.subjectIds.mia, ids.subjectIds.otr].filter(Boolean)) {
      await admin.from('subjects').delete().eq('id', id)
    }
    if (ids.subjectIds.mine) {
      await admin.from('enrollments').delete().in('student_id', ids.studentIds)
    }
    for (const id of [...ids.studentIds, ids.otherProfessorId].filter(Boolean)) {
      await admin.auth.admin.deleteUser(id)
    }
  })

  test('coordinator sees the requests grouped by subject and by student, searches, and approves a selection', async ({
    page,
  }) => {
    const admin = getAdmin()
    await loginAs(page, ADMIN_USER.email, ADMIN_USER.password)

    // The dashboard attention area now points to the new screen.
    await expect(
      page.getByRole('link', { name: /solicitudes? de inscripción pendientes?/i })
    ).toHaveAttribute('href', '/admin/enrollment-requests')

    await page.goto(`/admin/enrollment-requests?q=${lastName}`)

    // "Por materia" (default view): a group per subject with its rows.
    const mineGroup = page.getByRole('region', { name: MINE.name })
    const otrGroup = page.getByRole('region', { name: OTR.name })
    await expect(mineGroup.getByText('2 pendientes')).toBeVisible()
    await expect(mineGroup.getByText(s1.fullName)).toBeVisible()
    await expect(mineGroup.getByText(s2.fullName)).toBeVisible()
    await expect(otrGroup.getByText('3 pendientes')).toBeVisible()
    await expect(page.getByRole('region', { name: MIA.name }).getByText(s3.fullName)).toBeVisible()

    // "Por estudiante": a group per student with the subjects as rows.
    await page.getByRole('link', { name: 'Por estudiante' }).click()
    await expect(page).toHaveURL(/view=student/)
    const s1Group = page.getByRole('region', { name: s1.fullName })
    await expect(s1Group.getByText('2 pendientes')).toBeVisible()
    await expect(s1Group.getByText(MINE.name)).toBeVisible()
    await expect(s1Group.getByText(OTR.name)).toBeVisible()
    await expect(
      page.getByRole('region', { name: s3.fullName }).getByText('2 pendientes')
    ).toBeVisible()

    // The search box narrows by subject code (a different branch than names).
    await page.getByRole('link', { name: 'Por materia' }).click()
    await expect(page).not.toHaveURL(/view=student/)
    await expect(page.getByRole('region', { name: MINE.name })).toBeVisible()
    await page.getByLabel('Buscar por estudiante o materia').fill(OTR.code)
    await expect(page).toHaveURL(new RegExp(`q=${OTR.code}`))
    await expect(page.getByRole('region', { name: OTR.name })).toBeVisible()
    await expect(page.getByRole('region', { name: MINE.name })).toHaveCount(0)

    // Select two requests of the other professor's subject and approve them.
    await page.goto(`/admin/enrollment-requests?q=${lastName}`)
    await page
      .getByRole('checkbox', {
        name: `Seleccionar la solicitud de ${s1.fullName} para ${OTR.name}`,
      })
      .check()
    await page
      .getByRole('checkbox', {
        name: `Seleccionar la solicitud de ${s2.fullName} para ${OTR.name}`,
      })
      .check()
    await expect(page.getByText('2 seleccionadas')).toBeVisible()

    await page.getByRole('button', { name: 'Aprobar seleccionadas (2)' }).click()
    await expect(page.getByRole('dialog')).toContainText('¿Aprobar 2 solicitudes?')
    await page.getByRole('button', { name: 'Aprobar (2)' }).click()
    await expect(page.getByText('2 solicitudes aprobadas.')).toBeVisible()

    // Both are enrolled and marked approved; the third stays pending.
    const { data: enrolled } = await admin
      .from('enrollments')
      .select('student_id')
      .eq('subject_id', ids.subjectIds.otr)
    expect((enrolled || []).map((e) => e.student_id).sort()).toEqual(
      [ids.studentIds[0], ids.studentIds[1]].sort()
    )
    const { data: statuses } = await admin
      .from('enrollment_requests')
      .select('id, status')
      .eq('subject_id', ids.subjectIds.otr)
    const byId = Object.fromEntries((statuses || []).map((r) => [r.id, r.status]))
    expect(byId[ids.requestIds['s1-otr']]).toBe('approved')
    expect(byId[ids.requestIds['s2-otr']]).toBe('approved')
    expect(byId[ids.requestIds['s3-otr']]).toBe('pending')
  })

  test('professor sees only their own subjects, approves one and cannot see another professor requests', async ({
    page,
  }) => {
    const admin = getAdmin()
    await loginAs(page, PROFESSOR_USER.email, PROFESSOR_USER.password)

    // Entry point from the subjects screen.
    await expect(page).toHaveURL(/\/professor\/subjects/)
    await page
      .getByRole('link', { name: /^Solicitudes/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/professor\/requests/)

    await page.goto(`/professor/requests?q=${lastName}`)
    await expect(page.getByRole('region', { name: MINE.name })).toBeVisible()
    await expect(page.getByRole('region', { name: MIA.name })).toBeVisible()
    // The other professor's subject (still has a pending request) is not there.
    await expect(page.getByRole('region', { name: OTR.name })).toHaveCount(0)
    await expect(page.getByText(OTR.code)).toHaveCount(0)

    // Direct access to the other professor's per-subject page is refused.
    await page.goto(`/professor/subjects/${ids.subjectIds.otr}/requests`)
    await expect(page).toHaveURL(/\/professor\/subjects$/)

    // Approve one request of their own subject from its row.
    await page.goto(`/professor/requests?q=${lastName}`)
    const row = page
      .getByRole('region', { name: MINE.name })
      .getByRole('listitem')
      .filter({ hasText: s1.fullName })
    await row.getByRole('button', { name: 'Aprobar' }).click()
    await expect(page.getByText('1 solicitud aprobada.')).toBeVisible()

    const { data: enrollment } = await admin
      .from('enrollments')
      .select('id')
      .eq('subject_id', ids.subjectIds.mine)
      .eq('student_id', ids.studentIds[0])
    expect(enrollment).toHaveLength(1)
    const { data: other } = await admin
      .from('enrollment_requests')
      .select('status')
      .eq('id', ids.requestIds['s3-otr'])
      .single()
    expect(other!.status).toBe('pending')
  })
})
