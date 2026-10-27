import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ToastProvider } from '@/components/toast/ToastProvider'
import UserReportModal from './UserReportModal'

const downloadReport = vi.fn()
vi.mock('@/lib/reports/downloadReport', () => ({
  downloadReport: (...args: unknown[]) => downloadReport(...args),
}))

const USER_ID = '3f2b8c1e-0a4d-4c55-9e2a-7d1f6b9a1c10'

function renderModal(role: 'STUDENT' | 'PROFESSOR' = 'STUDENT') {
  const onClose = vi.fn()
  render(
    <ToastProvider>
      <UserReportModal userId={USER_ID} userName="Ana Pérez" role={role} onClose={onClose} />
    </ToastProvider>
  )
  return { onClose }
}

beforeEach(() => {
  vi.clearAllMocks()
  downloadReport.mockResolvedValue({ ok: true })
})

describe('UserReportModal', () => {
  it('shows who the report is for and describes the role-specific content', () => {
    renderModal('PROFESSOR')
    expect(screen.getByText(/Ana Pérez · Docente/)).toBeTruthy()
    expect(screen.getByText(/clases programadas, dictadas, suspendidas/)).toBeTruthy()
  })

  it('downloads the whole history in the chosen format and closes', async () => {
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Descargar PDF/ }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const url = String(downloadReport.mock.calls[0][0])
    expect(url).toBe(`/admin/reports/user?userId=${USER_ID}&format=pdf`)
  })

  it('sends the range when both dates are filled in', async () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-31' } })
    fireEvent.click(screen.getByRole('button', { name: /Descargar Excel/ }))
    await waitFor(() => expect(downloadReport).toHaveBeenCalled())
    const url = String(downloadReport.mock.calls[0][0])
    expect(url).toContain('format=xlsx')
    expect(url).toContain('from=2026-10-01')
    expect(url).toContain('to=2026-10-31')
  })

  it('blocks the download while only one date is filled in', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
    expect(screen.getByRole('alert').textContent).toContain('fecha inicial y la final')
    const excel = screen.getByRole('button', { name: /Descargar Excel/ }) as HTMLButtonElement
    expect(excel.disabled).toBe(true)
    fireEvent.click(excel)
    expect(downloadReport).not.toHaveBeenCalled()
  })

  it('keeps the modal open and shows the server error when the download fails', async () => {
    downloadReport.mockResolvedValue({ ok: false, error: 'No se pudo generar el reporte.' })
    const { onClose } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: /Descargar Excel/ }))
    await waitFor(() => expect(screen.getByText('No se pudo generar el reporte.')).toBeTruthy())
    expect(onClose).not.toHaveBeenCalled()
  })
})
