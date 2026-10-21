import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { ToastProvider } from '@/components/toast/ToastProvider'
import AttendanceReportPanel from './AttendanceReportPanel'

const props = {
  periods: [{ id: 'p1', name: '2026-1' }],
  cutsByPeriod: { p1: [{ id: 'c1', name: 'Corte 1' }] },
  subjects: [{ id: 's1', name: 'Derecho', code: 'DER', periodId: 'p1', professorId: 'pr1' }],
  professors: [{ id: 'pr1', name: 'Ana' }],
}

function renderPanel() {
  return render(
    <ToastProvider>
      <AttendanceReportPanel {...props} />
    </ToastProvider>
  )
}

const summaryBody = {
  scopeLabel: 'Todo el período',
  totals: {
    subjects: 1,
    students: 3,
    sessionsHeld: 9,
    overallAttendancePct: 74.1,
    atRiskStudents: 1,
    failedStudents: 1,
    complianceOverallPct: 83.3,
  },
}

describe('AttendanceReportPanel summary', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('debounces filter changes into a single summary request', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      redirected: false,
      json: async () => summaryBody,
    }))
    vi.stubGlobal('fetch', fetchMock)
    renderPanel()

    // Cambios rápidos de alcance, docente y materia antes de que venza el debounce.
    fireEvent.change(screen.getByLabelText(/^Alcance/), { target: { value: 'c1' } })
    fireEvent.change(screen.getByLabelText(/^Docente/), { target: { value: 'pr1' } })
    fireEvent.change(screen.getByLabelText(/^Materia/), { target: { value: 's1' } })
    expect(fetchMock).not.toHaveBeenCalled()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const url = String((fetchMock.mock.calls[0] as unknown[])[0])
    expect(url).toContain('cutId=c1')
    expect(url).toContain('professorId=pr1')
    expect(url).toContain('subjectId=s1')
    expect(url).toContain('format=summary')
    expect(screen.getByText('74.1%')).toBeTruthy()
  })

  it('shows an error instead of "Calculando" forever when the session expired', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        redirected: true,
        json: async () => {
          throw new SyntaxError('html')
        },
      }))
    )
    renderPanel()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(screen.getByText(/sesión expiró/i)).toBeTruthy()
    expect(screen.queryByText(/Calculando/)).toBeNull()
  })

  it('treats a non-JSON 200 body as an error too', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        redirected: false,
        json: async () => {
          throw new SyntaxError('html')
        },
      }))
    )
    renderPanel()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(450)
    })
    expect(screen.getByText(/sesión expiró/i)).toBeTruthy()
  })
})
