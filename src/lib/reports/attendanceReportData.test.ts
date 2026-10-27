// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadReportData } from './attendanceReportData'
import { generateAdminReport } from './adminReportService'
import { generateStudentReport } from './studentReportService'
import { fetchClassStats } from '@/lib/attendance/classOmissionsData'

type TableResult = { data?: unknown; error?: unknown }
type Tables = Record<string, TableResult | TableResult[]>

interface Call {
  table: string
  method: string
  args: unknown[]
}

/** Chainable, thenable fake of the PostgREST builder, with per-table results. */
function fakeClient(tables: Tables) {
  const calls: Call[] = []
  const client = {
    from(table: string) {
      const builder: Record<string, unknown> = {}
      const result = (): TableResult => {
        const entry = tables[table]
        const picked = Array.isArray(entry) ? (entry.length > 1 ? entry.shift() : entry[0]) : entry
        return { data: picked?.data ?? [], error: picked?.error ?? null }
      }
      for (const method of ['select', 'eq', 'in', 'order', 'range', 'gte', 'lt', 'lte', 'not']) {
        builder[method] = vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        })
      }
      builder.maybeSingle = vi.fn(async () => {
        const r = result()
        const data = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data
        return { data, error: r.error }
      })
      builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
      return builder
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}

const subjectRow = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  name: `Materia ${id}`,
  code: id.toUpperCase(),
  is_active: true,
  professor_id: 'prof-1',
  period_id: 'p1',
  absence_rule_type: null,
  max_absence_percentage: null,
  max_absence_count: null,
  total_planned_sessions: null,
  lates_per_absence: null,
  professor: { name: 'Ana' },
  period: { id: 'p1', name: '2026-1', start_date: '2026-02-01', end_date: '2026-06-01' },
  subject_careers: [],
  ...overrides,
})

const boom = { message: 'canceling statement due to statement timeout' }

describe('loadReportData errors', () => {
  it('rejects instead of returning an empty report when the subjects query fails', async () => {
    const { client } = fakeClient({ subjects: { data: null, error: boom } })
    await expect(loadReportData(client, { periodId: 'p1' })).rejects.toThrow(
      /No se pudieron cargar las materias/
    )
    await expect(loadReportData(client, { subjectIds: ['s1'] })).rejects.toThrow()
  })

  it('rejects when the cuts query fails (cuts would silently disappear)', async () => {
    const { client } = fakeClient({
      subjects: { data: [subjectRow('s1')] },
      period_cuts: { data: null, error: boom },
    })
    await expect(loadReportData(client, { periodId: 'p1' })).rejects.toThrow(/cortes/)
  })

  it.each(['sessions', 'enrollments', 'attendances', 'absence_justifications'])(
    'rejects when the %s query fails',
    async (table) => {
      const { client } = fakeClient({
        subjects: { data: [subjectRow('s1')] },
        [table]: { data: null, error: boom },
      })
      await expect(loadReportData(client, { periodId: 'p1' })).rejects.toThrow()
    }
  )
})

describe('loadReportData dateRange', () => {
  const dateRange = { startIso: '2026-10-05T05:00:00.000Z', endIso: '2026-10-10T05:00:00.000Z' }

  it('bounds sessions, attendances and justifications to the window', async () => {
    const { client, calls } = fakeClient({ subjects: { data: [subjectRow('s1')] } })
    await loadReportData(client, { subjectIds: ['s1'], dateRange })

    const sessionCalls = calls.filter((c) => c.table === 'sessions')
    expect(sessionCalls.find((c) => c.method === 'gte')?.args).toEqual(['date', dateRange.startIso])
    expect(sessionCalls.find((c) => c.method === 'lt')?.args).toEqual(['date', dateRange.endIso])

    for (const table of ['attendances', 'absence_justifications']) {
      const tableCalls = calls.filter((c) => c.table === table)
      expect(tableCalls.find((c) => c.method === 'gte')?.args).toEqual([
        'sessions.date',
        dateRange.startIso,
      ])
      expect(tableCalls.find((c) => c.method === 'lt')?.args).toEqual([
        'sessions.date',
        dateRange.endIso,
      ])
    }
    // Attendance rows carry the scan time for the range report.
    const select = calls.find((c) => c.table === 'attendances' && c.method === 'select')
    expect(String(select?.args[0])).toContain('scanned_at')
  })

  describe('widenToCuts', () => {
    const cutRow = {
      id: 'k1',
      period_id: 'p1',
      name: 'Corte 1',
      start_date: '2026-10-01',
      end_date: '2026-11-30',
      sequence: 1,
    }

    it('widens the window to cover the cuts of the loaded subjects', async () => {
      const { client, calls } = fakeClient({
        subjects: { data: [subjectRow('s1')] },
        period_cuts: { data: [cutRow] },
      })
      await loadReportData(client, { subjectIds: ['s1'], dateRange, widenToCuts: true })
      const sessionCalls = calls.filter((c) => c.table === 'sessions')
      // Bogota midnight of the first and last cut days, not the narrower request.
      expect(sessionCalls.find((c) => c.method === 'gte')?.args).toEqual([
        'date',
        '2026-10-01T05:00:00.000Z',
      ])
      expect(sessionCalls.find((c) => c.method === 'lt')?.args).toEqual([
        'date',
        '2026-12-01T05:00:00.000Z',
      ])
    })

    it('never narrows the requested window', async () => {
      const wide = { startIso: '2026-09-01T05:00:00.000Z', endIso: '2027-01-10T05:00:00.000Z' }
      const { client, calls } = fakeClient({
        subjects: { data: [subjectRow('s1')] },
        period_cuts: { data: [cutRow] },
      })
      await loadReportData(client, { subjectIds: ['s1'], dateRange: wide, widenToCuts: true })
      const sessionCalls = calls.filter((c) => c.table === 'sessions')
      expect(sessionCalls.find((c) => c.method === 'gte')?.args).toEqual(['date', wide.startIso])
      expect(sessionCalls.find((c) => c.method === 'lt')?.args).toEqual(['date', wide.endIso])
    })

    it('keeps the requested window when the subjects have no cuts', async () => {
      const { client, calls } = fakeClient({ subjects: { data: [subjectRow('s1')] } })
      await loadReportData(client, { subjectIds: ['s1'], dateRange, widenToCuts: true })
      const sessionCalls = calls.filter((c) => c.table === 'sessions')
      expect(sessionCalls.find((c) => c.method === 'gte')?.args).toEqual([
        'date',
        dateRange.startIso,
      ])
    })
  })

  it('does not filter by date when no window is given', async () => {
    const { client, calls } = fakeClient({ subjects: { data: [subjectRow('s1')] } })
    await loadReportData(client, { subjectIds: ['s1'] })
    expect(calls.some((c) => c.method === 'gte' || c.method === 'lt')).toBe(false)
  })

  it('skips the justifications query on request', async () => {
    const { client, calls } = fakeClient({ subjects: { data: [subjectRow('s1')] } })
    const data = await loadReportData(client, { subjectIds: ['s1'], skipJustifications: true })
    expect(data.justifications).toEqual([])
    expect(calls.some((c) => c.table === 'absence_justifications')).toBe(false)
    expect(calls.some((c) => c.table === 'attendances')).toBe(true)

    const normal = fakeClient({ subjects: { data: [subjectRow('s1')] } })
    await loadReportData(normal.client, { subjectIds: ['s1'] })
    expect(normal.calls.some((c) => c.table === 'absence_justifications')).toBe(true)
  })

  it('maps the scan time into the attendance inputs', async () => {
    const { client } = fakeClient({
      subjects: { data: [subjectRow('s1')] },
      attendances: {
        data: [
          {
            session_id: 'x',
            student_id: 'a',
            status: 'PRESENT',
            marked_by: null,
            manual_reason: null,
            scanned_at: '2026-10-05T13:02:00Z',
          },
        ],
      },
    })
    const data = await loadReportData(client, { subjectIds: ['s1'], dateRange })
    expect(data.attendances[0].scannedAt).toBe('2026-10-05T13:02:00Z')
  })
})

describe('generateAdminReport', () => {
  it('throws (so the route answers 500) when the period or cuts queries fail', async () => {
    const periodFails = fakeClient({ periods: { data: null, error: boom } })
    await expect(generateAdminReport(periodFails.client, { periodId: 'p1' })).rejects.toThrow()

    const cutsFail = fakeClient({
      periods: { data: [{ id: 'p1', name: '2026-1', start_date: null, end_date: null }] },
      period_cuts: { data: null, error: boom },
    })
    await expect(generateAdminReport(cutsFail.client, { periodId: 'p1' })).rejects.toThrow(/cortes/)
  })

  it('excludes archived subjects from the report', async () => {
    const { client } = fakeClient({
      periods: { data: [{ id: 'p1', name: '2026-1', start_date: null, end_date: null }] },
      subjects: {
        data: [subjectRow('s1'), subjectRow('s2', { is_active: false, professor_id: 'prof-2' })],
      },
    })
    const result = await generateAdminReport(client, { periodId: 'p1' })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.report.subjectSummaries.map((s) => s.subjectCode)).toEqual(['S1'])
    expect(result.report.professors.map((p) => p.professorId)).toEqual(['prof-1'])
  })

  it('scopes the load to the filtered subjects instead of the whole period', async () => {
    const { client, calls } = fakeClient({
      periods: { data: [{ id: 'p1', name: '2026-1', start_date: null, end_date: null }] },
      subjects: [
        { data: [{ id: 's1' }] }, // consulta de ids del filtro
        { data: [subjectRow('s1')] }, // loadReportData
      ],
    })
    const result = await generateAdminReport(client, { periodId: 'p1', professorId: 'prof-1' })
    expect(result.ok).toBe(true)

    const subjectCalls = calls.filter((c) => c.table === 'subjects')
    // La consulta de ids filtra por docente y por período...
    expect(subjectCalls.some((c) => c.method === 'eq' && c.args[0] === 'professor_id')).toBe(true)
    // ...y la carga completa usa .in('id', ids), no .eq('period_id') sobre todo el período.
    const loadFilters = subjectCalls.filter((c) => c.method === 'in' && c.args[0] === 'id')
    expect(loadFilters[0]?.args[1]).toEqual(['s1'])
  })

  it('answers 404 when no subject matches the filters', async () => {
    const { client } = fakeClient({
      periods: { data: [{ id: 'p1', name: '2026-1', start_date: null, end_date: null }] },
      subjects: { data: [] },
    })
    const result = await generateAdminReport(client, { periodId: 'p1', subjectId: 'nope' })
    expect(result).toMatchObject({ ok: false, status: 404 })
  })
})

describe('generateStudentReport', () => {
  it('throws when the enrollments or profile query fails', async () => {
    const profileFails = fakeClient({ profiles: { data: null, error: boom } })
    await expect(generateStudentReport(profileFails.client, 'st1')).rejects.toThrow()

    const enrollmentsFail = fakeClient({
      profiles: { data: [{ name: 'Ana', student_code: 'X', role: 'STUDENT', is_active: true }] },
      enrollments: { data: null, error: boom },
    })
    await expect(generateStudentReport(enrollmentsFail.client, 'st1')).rejects.toThrow(
      /inscripciones/
    )
  })
})

describe('fetchClassStats errors', () => {
  const period = { start_date: '2026-02-01', end_date: '2026-06-01' }
  const row = {
    id: 's1',
    name: 'M',
    code: 'M',
    professor_id: 'p',
    period,
    professor: { name: 'A' },
  }

  it.each(['subjects', 'subject_schedules'])(
    'rejects instead of returning partial compliance when %s fails',
    async (table) => {
      const { client } = fakeClient({
        subjects: { data: [row] },
        subject_schedules: {
          data: [
            {
              id: 'b',
              subject_id: 's1',
              day_of_week: 1,
              start_time: '08:00',
              end_time: '10:00',
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
        },
        [table]: { data: null, error: boom },
      })
      await expect(fetchClassStats(client, { subjectIds: ['s1'] })).rejects.toThrow()
    }
  )

  it.each(['sessions', 'class_omissions'])('rejects when %s fails', async (table) => {
    const { client } = fakeClient({
      subjects: { data: [row] },
      subject_schedules: {
        data: [
          {
            id: 'b',
            subject_id: 's1',
            day_of_week: 1,
            start_time: '08:00',
            end_time: '10:00',
            created_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
      [table]: { data: null, error: boom },
    })
    await expect(fetchClassStats(client, { subjectIds: ['s1'] })).rejects.toThrow()
  })
})
