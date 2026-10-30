import { describe, it, expect, vi, beforeEach } from 'vitest'
import { approveRequests, rejectRequests, dedupeIds } from './review'
import { makeFakeDb, type FakeDbState } from './fakeDb'

const mockAuditMany = vi.fn()
vi.mock('@/lib/audit/auditLog', () => ({ logAuditMany: (rows: unknown) => mockAuditMany(rows) }))

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const R1 = uid(1)
const R2 = uid(2)
const R3 = uid(3)
const S1 = uid(101) // materia 1
const S2 = uid(102) // materia 2
const ST1 = uid(201)
const ST2 = uid(202)
const ST3 = uid(203)
const ME = uid(900)

const request = (id: string, student: string, subject: string, status = 'pending') => ({
  id,
  student_id: student,
  subject_id: subject,
  status,
})

// Estado base: coordinación, tres solicitudes pendientes, todos en la misma carrera.
function baseState(overrides: Partial<FakeDbState> = {}): Partial<FakeDbState> {
  return {
    caller: { role: 'ADMIN', is_active: true },
    requests: [request(R1, ST1, S1), request(R2, ST2, S1), request(R3, ST3, S2)],
    subjects: [
      { id: S1, professor_id: ME },
      { id: S2, professor_id: uid(901) },
    ],
    subjectCareers: [
      { subject_id: S1, career_id: 'c1', is_active: true },
      { subject_id: S2, career_id: 'c1', is_active: true },
    ],
    studentCareers: [
      { student_id: ST1, career_id: 'c1', is_active: true },
      { student_id: ST2, career_id: 'c1', is_active: true },
      { student_id: ST3, career_id: 'c1', is_active: true },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  mockAuditMany.mockReset()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('dedupeIds', () => {
  it('drops duplicates keeping order', () => {
    expect(dedupeIds(['b', 'a', 'b', 'c', 'a'])).toEqual(['b', 'a', 'c'])
  })
})

describe('approveRequests', () => {
  it('approves, enrolls and audits every request in one pass', async () => {
    const { supabase, state } = makeFakeDb(baseState())

    const result = await approveRequests(supabase, ME, [R1, R2, R3])

    expect(result.approved).toEqual([R1, R2, R3])
    expect(result.failures).toEqual([])
    expect(state.requests.map((r) => r.status)).toEqual(['approved', 'approved', 'approved'])
    expect(state.requests[0].reviewed_by).toBe(ME)
    expect(state.enrollments).toHaveLength(3)
    expect(mockAuditMany).toHaveBeenCalledTimes(1)
    const audited = mockAuditMany.mock.calls[0][0] as { entityId: string; action: string }[]
    expect(audited.map((a) => a.entityId)).toEqual([R1, R2, R3])
    expect(audited.every((a) => a.action === 'enrollment_request.approve')).toBe(true)
  })

  it('dedupes repeated ids so each request is processed once', async () => {
    const { supabase, state } = makeFakeDb(baseState())

    const result = await approveRequests(supabase, ME, [R1, R1, R1])

    expect(result.approved).toEqual([R1])
    expect(state.enrollments).toHaveLength(1)
  })

  it('uses a constant number of queries regardless of the batch size', async () => {
    const { supabase, calls } = makeFakeDb(baseState())

    await approveRequests(supabase, ME, [R1, R2, R3])

    // requests, profiles, subject_careers, student_careers, claim, enrollments upsert
    expect(calls).toHaveLength(6)
  })

  it('reports unknown and malformed ids without querying them', async () => {
    const { supabase } = makeFakeDb(baseState())

    const result = await approveRequests(supabase, ME, ['not-a-uuid', uid(777), R1])

    expect(result.approved).toEqual([R1])
    expect(result.failures).toEqual([
      { id: 'not-a-uuid', message: 'Solicitud no encontrada.' },
      { id: uid(777), message: 'Solicitud no encontrada.' },
    ])
  })

  it('lets an admin approve requests of any subject', async () => {
    const { supabase } = makeFakeDb(baseState({ caller: { role: 'ADMIN', is_active: true } }))

    const result = await approveRequests(supabase, uid(555), [R1, R3])

    expect(result.approved).toEqual([R1, R3])
  })

  it('lets a professor approve only requests of subjects they own', async () => {
    const { supabase, state } = makeFakeDb(
      baseState({ caller: { role: 'PROFESSOR', is_active: true } })
    )

    // R1 es de S1 (de ME); R3 es de S2 (de otro profesor).
    const result = await approveRequests(supabase, ME, [R1, R3])

    expect(result.approved).toEqual([R1])
    expect(result.failures).toEqual([
      { id: R3, message: 'No tienes permiso para revisar esta solicitud.' },
    ])
    expect(state.requests.find((r) => r.id === R3)?.status).toBe('pending')
    expect(state.enrollments).toHaveLength(1)
  })

  it('denies a deactivated professor even on their own subject', async () => {
    const { supabase, state } = makeFakeDb(
      baseState({ caller: { role: 'PROFESSOR', is_active: false } })
    )

    const result = await approveRequests(supabase, ME, [R1])

    expect(result.approved).toEqual([])
    expect(result.failures[0].message).toMatch(/no tienes permiso/i)
    expect(state.requests[0].status).toBe('pending')
  })

  it('denies a deactivated admin', async () => {
    const { supabase } = makeFakeDb(baseState({ caller: { role: 'ADMIN', is_active: false } }))

    const result = await approveRequests(supabase, ME, [R1])

    expect(result.approved).toEqual([])
    expect(result.failures[0].message).toMatch(/no tienes permiso/i)
  })

  it('does not reveal the state of a request the caller cannot review', async () => {
    const { supabase } = makeFakeDb(
      baseState({
        caller: { role: 'PROFESSOR', is_active: true },
        requests: [request(R3, ST3, S2, 'approved')],
      })
    )

    const result = await approveRequests(supabase, ME, [R3])

    expect(result.failures[0].message).toMatch(/no tienes permiso/i)
  })

  it('skips requests that were already processed', async () => {
    const { supabase } = makeFakeDb(
      baseState({
        requests: [request(R1, ST1, S1, 'rejected'), request(R2, ST2, S1)],
      })
    )

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([R2])
    expect(result.failures).toEqual([{ id: R1, message: 'Esta solicitud ya fue procesada.' }])
  })

  it('partially fails: students outside the subject career are reported, the rest approved', async () => {
    const { supabase, state } = makeFakeDb(
      baseState({
        studentCareers: [
          { student_id: ST1, career_id: 'c1', is_active: true },
          { student_id: ST2, career_id: 'other', is_active: true },
          // ST3 no tiene carrera
        ],
      })
    )

    const result = await approveRequests(supabase, ME, [R1, R2, R3])

    expect(result.approved).toEqual([R1])
    expect(result.failures).toEqual([
      { id: R2, message: 'El estudiante no pertenece a la carrera de esta materia.' },
      { id: R3, message: 'El estudiante no tiene ninguna carrera asignada.' },
    ])
    expect(state.requests.map((r) => r.status)).toEqual(['approved', 'pending', 'pending'])
    expect(state.enrollments).toHaveLength(1)
    // Solo la aprobada se audita.
    expect((mockAuditMany.mock.calls[0][0] as unknown[]).length).toBe(1)
  })

  it('fails requests of a subject without careers', async () => {
    const { supabase } = makeFakeDb(
      baseState({ subjectCareers: [{ subject_id: S2, career_id: 'c1', is_active: true }] })
    )

    const result = await approveRequests(supabase, ME, [R1])

    expect(result.failures[0].message).toMatch(/no pertenece a ninguna carrera/i)
  })

  it('reports a claim lost to a concurrent reviewer and does not enroll the student', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    // Otro revisor gana la carrera de R1 entre la lectura y el reclamo.
    state.failures.requestsUpdate = (_payload, filters) => {
      const target = state.requests.find((r) => r.id === R1)!
      const inFilter = filters.find((f) => f.kind === 'in')
      if ((inFilter?.value as string[]).includes(R1)) target.status = 'rejected'
      return null
    }

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([R2])
    expect(result.failures).toEqual([{ id: R1, message: 'La solicitud ya fue revisada.' }])
    expect(state.enrollments.map((e) => e.student_id)).toEqual([ST2])
  })

  it('tolerates students who were already enrolled (duplicate key is not an error)', async () => {
    const { supabase, state } = makeFakeDb(
      baseState({ enrollments: [{ student_id: ST1, subject_id: S1 }] })
    )

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([R1, R2])
    expect(result.failures).toEqual([])
    expect(state.enrollments).toHaveLength(2)
  })

  it('falls back to row-by-row inserts when the batch fails, treating 23505 as success', async () => {
    const { supabase, state, calls } = makeFakeDb(
      baseState({ enrollments: [{ student_id: ST1, subject_id: S1 }] })
    )
    state.failures.enrollmentsUpsert = { code: '42501', message: 'rls' }

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([R1, R2])
    expect(calls.filter((c) => c.op === 'insert')).toHaveLength(2)
    expect(state.enrollments).toHaveLength(2)
  })

  it('reverts the claim to pending when the enrollment insert fails, and reports it', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.enrollmentsUpsert = { code: '42501', message: 'rls' }
    // Con el lote caído, la fila de ST2 sigue fallando al reintentar.
    state.failures.enrollmentsInsert = (row) =>
      row.student_id === ST2 ? { code: '42501', message: 'rls' } : null

    const result = await approveRequests(supabase, ME, [R1, R2, R3])

    expect(result.approved).toEqual([R1, R3])
    expect(result.failures).toEqual([{ id: R2, message: 'No se pudo aprobar la solicitud.' }])
    const r2 = state.requests.find((r) => r.id === R2)!
    expect(r2.status).toBe('pending')
    expect(r2.reviewed_at).toBeNull()
    expect(r2.reviewed_by).toBeNull()
    // Las demás siguen aprobadas e inscritas.
    expect(state.requests.find((r) => r.id === R1)?.status).toBe('approved')
    expect(state.enrollments.map((e) => e.student_id).sort()).toEqual([ST1, ST3].sort())
    // La reversa y la falla no se auditan como aprobación.
    const audited = mockAuditMany.mock.calls[0][0] as { entityId: string }[]
    expect(audited.map((a) => a.entityId)).toEqual([R1, R3])
  })

  it('reports every request as failed when the enrollment cannot be saved at all', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.enrollmentsUpsert = { code: 'XX000', message: 'boom' }
    state.failures.enrollmentsInsert = () => ({ code: 'XX000', message: 'boom' })

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([])
    expect(result.failures).toHaveLength(2)
    expect(state.requests.filter((r) => r.status === 'pending')).toHaveLength(3)
    expect(state.enrollments).toHaveLength(0)
  })

  it('does not approve anything when the requests cannot be loaded', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.requestsSelect = { message: 'down' }

    const result = await approveRequests(supabase, ME, [R1])

    expect(result.approved).toEqual([])
    expect(result.failures[0].message).toMatch(/no se pudieron cargar/i)
  })

  it('does not approve anything when the careers cannot be validated', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.careersSelect = { message: 'down' }

    const result = await approveRequests(supabase, ME, [R1])

    expect(result.approved).toEqual([])
    expect(result.failures[0].message).toMatch(/validar la carrera/i)
    expect(state.requests[0].status).toBe('pending')
  })

  it('reports a failed claim update for the whole batch', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.requestsUpdate = () => ({ message: 'down' })

    const result = await approveRequests(supabase, ME, [R1, R2])

    expect(result.approved).toEqual([])
    expect(result.failures.map((f) => f.message)).toEqual([
      'No se pudo actualizar la solicitud.',
      'No se pudo actualizar la solicitud.',
    ])
    expect(state.enrollments).toHaveLength(0)
  })
})

describe('rejectRequests', () => {
  it('rejects pending requests and audits them', async () => {
    const { supabase, state } = makeFakeDb(baseState())

    const result = await rejectRequests(supabase, ME, [R1, R2])

    expect(result.rejected).toEqual([R1, R2])
    expect(state.requests.map((r) => r.status)).toEqual(['rejected', 'rejected', 'pending'])
    expect(state.enrollments).toHaveLength(0)
    const audited = mockAuditMany.mock.calls[0][0] as { action: string }[]
    expect(audited.every((a) => a.action === 'enrollment_request.reject')).toBe(true)
  })

  it('denies requests of subjects the professor does not own', async () => {
    const { supabase, state } = makeFakeDb(
      baseState({ caller: { role: 'PROFESSOR', is_active: true } })
    )

    const result = await rejectRequests(supabase, ME, [R1, R3])

    expect(result.rejected).toEqual([R1])
    expect(result.failures[0]).toEqual({
      id: R3,
      message: 'No tienes permiso para revisar esta solicitud.',
    })
    expect(state.requests.find((r) => r.id === R3)?.status).toBe('pending')
  })

  it('does not touch requests that are no longer pending', async () => {
    const { supabase } = makeFakeDb(
      baseState({ requests: [request(R1, ST1, S1, 'approved'), request(R2, ST2, S1)] })
    )

    const result = await rejectRequests(supabase, ME, [R1, R2])

    expect(result.rejected).toEqual([R2])
    expect(result.failures).toEqual([{ id: R1, message: 'Esta solicitud ya fue procesada.' }])
  })

  it('reports a failed update for the whole batch', async () => {
    const { supabase, state } = makeFakeDb(baseState())
    state.failures.requestsUpdate = () => ({ message: 'down' })

    const result = await rejectRequests(supabase, ME, [R1])

    expect(result.rejected).toEqual([])
    expect(result.failures[0].message).toMatch(/no se pudo rechazar/i)
  })
})
