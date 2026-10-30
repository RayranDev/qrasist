// Soporte de pruebas: un "Supabase" en memoria con las tablas que tocan las
// operaciones de revisión de solicitudes, lo bastante fiel (eq/in/update/
// upsert) como para comprobar el estado final y no solo las llamadas.
import type { SupabaseClient } from '@supabase/supabase-js'

type Row = Record<string, unknown>
type Filter = { kind: 'eq' | 'in'; column: string; value: unknown }
export type DbError = { code?: string; message: string }

export interface FakeDbState {
  caller: { role: string; is_active: boolean } | null
  requests: Row[]
  subjects: Row[]
  subjectCareers: Row[]
  studentCareers: Row[]
  enrollments: Row[]
  /** Errores a inyectar: por tabla y operación; devolver null = sin error. */
  failures: {
    enrollmentsUpsert?: DbError | null
    enrollmentsInsert?: (row: Row) => DbError | null
    requestsUpdate?: (payload: Row, filters: Filter[]) => DbError | null
    requestsSelect?: DbError | null
    careersSelect?: DbError | null
  }
}

export interface FakeCall {
  table: string
  op: 'select' | 'update' | 'insert' | 'upsert'
  payload?: unknown
  options?: unknown
  filters: Filter[]
}

const matches = (row: Row, filters: Filter[]) =>
  filters.every((f) =>
    f.kind === 'eq' ? row[f.column] === f.value : (f.value as unknown[]).includes(row[f.column])
  )

export function makeFakeDb(initial: Partial<FakeDbState> = {}) {
  const state: FakeDbState = {
    caller: { role: 'ADMIN', is_active: true },
    requests: [],
    subjects: [],
    subjectCareers: [],
    studentCareers: [],
    enrollments: [],
    failures: {},
    ...initial,
  }
  const calls: FakeCall[] = []

  function run(call: FakeCall): { data: unknown; error: DbError | null } {
    calls.push(call)
    const { table, op, filters } = call
    const tableRows: Record<string, Row[]> = {
      enrollment_requests: state.requests,
      subjects: state.subjects,
      subject_careers: state.subjectCareers,
      student_careers: state.studentCareers,
      enrollments: state.enrollments,
    }

    if (table === 'profiles') {
      // Igual que la base: .eq('is_active', true) no encuentra una cuenta desactivada.
      const wantsActive = filters.some((f) => f.column === 'is_active' && f.value === true)
      return { data: wantsActive && !state.caller?.is_active ? null : state.caller, error: null }
    }
    const rows = tableRows[table]
    if (!rows) throw new Error(`unexpected table in test: ${table}`)

    if (op === 'select') {
      if (table === 'enrollment_requests' && state.failures.requestsSelect) {
        return { data: null, error: state.failures.requestsSelect }
      }
      if (
        (table === 'subject_careers' || table === 'student_careers') &&
        state.failures.careersSelect
      ) {
        return { data: null, error: state.failures.careersSelect }
      }
      return { data: rows.filter((r) => matches(r, filters)).map((r) => ({ ...r })), error: null }
    }

    if (op === 'update') {
      const error = state.failures.requestsUpdate?.(call.payload as Row, filters) ?? null
      if (error) return { data: null, error }
      const touched = rows.filter((r) => matches(r, filters))
      for (const r of touched) Object.assign(r, call.payload as Row)
      return { data: touched.map((r) => ({ id: r.id })), error: null }
    }

    if (op === 'upsert') {
      if (state.failures.enrollmentsUpsert)
        return { data: null, error: state.failures.enrollmentsUpsert }
      for (const row of call.payload as Row[]) {
        const exists = rows.some(
          (r) => r.student_id === row.student_id && r.subject_id === row.subject_id
        )
        if (!exists) rows.push({ ...row })
      }
      return { data: null, error: null }
    }

    // insert (una fila)
    const row = call.payload as Row
    const error = state.failures.enrollmentsInsert?.(row) ?? null
    if (error) return { data: null, error }
    if (rows.some((r) => r.student_id === row.student_id && r.subject_id === row.subject_id)) {
      return { data: null, error: { code: '23505', message: 'duplicate key' } }
    }
    rows.push({ ...row })
    return { data: null, error: null }
  }

  const supabase = {
    from(table: string) {
      const call: FakeCall = { table, op: 'select', filters: [] }
      const builder: Record<string, unknown> = {}
      const done = () => Promise.resolve(run({ ...call, filters: [...call.filters] }))
      builder.select = () => builder
      builder.update = (payload: unknown) => {
        call.op = 'update'
        call.payload = payload
        return builder
      }
      builder.insert = (payload: unknown) => {
        call.op = 'insert'
        call.payload = payload
        return builder
      }
      builder.upsert = (payload: unknown, options?: unknown) => {
        call.op = 'upsert'
        call.payload = payload
        call.options = options
        return builder
      }
      builder.eq = (column: string, value: unknown) => {
        call.filters.push({ kind: 'eq', column, value })
        return builder
      }
      builder.in = (column: string, value: unknown[]) => {
        call.filters.push({ kind: 'in', column, value })
        return builder
      }
      builder.single = () =>
        done().then((r) => ({ ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data }))
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        done().then(resolve, reject)
      return builder
    },
  }

  return { supabase: supabase as unknown as SupabaseClient, state, calls }
}
