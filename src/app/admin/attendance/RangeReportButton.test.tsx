import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/toast/ToastProvider'
import RangeReportButton from './RangeReportButton'

const downloadReport = vi.fn()
vi.mock('@/lib/reports/downloadReport', () => ({
  downloadReport: (...args: unknown[]) => downloadReport(...args),
}))

function renderButton() {
  render(
    <ToastProvider>
      <RangeReportButton
        from="2026-10-01"
        to="2026-10-31"
        subjectId="3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10"
        label="Descargar mes"
        title="Excel con la asistencia del mes."
      />
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  downloadReport.mockResolvedValue({ ok: true })
})

describe('RangeReportButton', () => {
  it('downloads without IP and location by default', async () => {
    renderButton()
    const checkbox = screen.getByRole('checkbox', { name: /Incluir IP y ubicación/ })
    expect((checkbox as HTMLInputElement).checked).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: /Descargar mes/ }))

    await waitFor(() => expect(downloadReport).toHaveBeenCalled())
    const url = String(downloadReport.mock.calls[0][0])
    expect(url).toContain('/admin/reports/attendance-range?')
    expect(url).not.toContain('includeCapture')
  })

  it('adds includeCapture=1 once the checkbox is on', async () => {
    renderButton()
    fireEvent.click(screen.getByRole('checkbox', { name: /Incluir IP y ubicación/ }))

    fireEvent.click(screen.getByRole('button', { name: /Descargar mes/ }))

    await waitFor(() => expect(downloadReport).toHaveBeenCalled())
    expect(String(downloadReport.mock.calls[0][0])).toContain('includeCapture=1')
  })
})
