import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createPeriod, updatePeriod } from './academic'

const mockGetUser = vi.fn()
const mockProfileSingle = vi.fn()
const mockPeriodInsert = vi.fn()
const mockPeriodUpdateEq = vi.fn()
const mockCutsEq = vi.fn()

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn((table: string) => {
      if (table === 'profiles') {
        const c: Record<string, unknown> = {}
        c.select = vi.fn(() => c)
        c.eq = vi.fn(() => c)
        c.single = mockProfileSingle
        return c
      }
      if (table === 'periods') {
        return {
          insert: mockPeriodInsert,
          update: vi.fn(() => ({ eq: mockPeriodUpdateEq })),
        }
      }
      if (table === 'period_cuts') {
        return { select: vi.fn(() => ({ eq: mockCutsEq })) }
      }
      throw new Error(`unexpected table in test: ${table}`)
    }),
  })),
}))

function periodForm(fields: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}

describe('period date validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'ADMIN' } })
    mockPeriodInsert.mockResolvedValue({ error: null })
    mockPeriodUpdateEq.mockResolvedValue({ error: null })
    mockCutsEq.mockResolvedValue({ data: [], error: null })
  })

  it('rejects creating a period whose end is before its start', async () => {
    const res = await createPeriod(
      periodForm({ name: '2026-2', start_date: '2026-08-30', end_date: '2026-06-02' })
    )
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/anterior a la fecha de fin/)
    expect(mockPeriodInsert).not.toHaveBeenCalled()
  })

  it('rejects equal start and end dates', async () => {
    const res = await createPeriod(
      periodForm({ name: '2026-2', start_date: '2026-08-30', end_date: '2026-08-30' })
    )
    expect(res.success).toBe(false)
  })

  it('maps the database CHECK violation to a clear message', async () => {
    mockPeriodInsert.mockResolvedValue({ error: { code: '23514' } })
    const res = await createPeriod(
      periodForm({ name: '2026-2', start_date: '2026-08-30', end_date: '2026-11-30' })
    )
    expect(res).toEqual({
      success: false,
      error: 'La fecha de inicio debe ser anterior a la fecha de fin',
    })
  })

  it('rejects updating a period to an inverted range', async () => {
    const res = await updatePeriod('p1', {
      name: '2026-2',
      start_date: '2026-11-30',
      end_date: '2026-08-30',
    })
    expect(res.success).toBe(false)
    expect(mockPeriodUpdateEq).not.toHaveBeenCalled()
  })

  it('rejects moving the range so an existing cut falls outside it', async () => {
    mockCutsEq.mockResolvedValue({
      data: [{ name: 'Corte 3', start_date: '2026-10-26', end_date: '2026-11-30' }],
      error: null,
    })
    const res = await updatePeriod('p1', {
      name: '2026-2',
      start_date: '2026-08-30',
      end_date: '2026-11-15',
    })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/Corte 3/)
    expect(mockPeriodUpdateEq).not.toHaveBeenCalled()
  })

  it('accepts a valid range that still contains every cut', async () => {
    mockCutsEq.mockResolvedValue({
      data: [{ name: 'Corte 1', start_date: '2026-08-30', end_date: '2026-09-27' }],
      error: null,
    })
    const res = await updatePeriod('p1', {
      name: '2026-2',
      start_date: '2026-08-30',
      end_date: '2026-11-30',
    })
    expect(res).toEqual({ success: true })
  })
})
