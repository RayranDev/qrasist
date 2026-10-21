import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import GlobalAbsencePolicyModal from './GlobalAbsencePolicyModal'

const mockGetCount = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/actions/adminAcademicPolicy', () => ({
  getActiveSubjectsCount: (...args: unknown[]) => mockGetCount(...args),
  updateGlobalAbsencePolicy: (...args: unknown[]) => mockUpdate(...args),
}))

function openModal() {
  render(<GlobalAbsencePolicyModal totalSubjectsCount={95} />)
  fireEvent.click(screen.getByRole('button', { name: /Configurar Política/ }))
}

describe('GlobalAbsencePolicyModal (DEF-QA-07)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCount.mockResolvedValue({ success: true, count: 37 })
    mockUpdate.mockResolvedValue({ success: true, countUpdated: 37 })
  })

  it('starts with "apply to all active subjects" unchecked and the submit disabled', () => {
    openModal()
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    const submit = screen.getByRole('button', { name: 'Revisar y aplicar' }) as HTMLButtonElement
    expect(submit.disabled).toBe(true)
  })

  it('asks for confirmation with the exact server-side count before overwriting', async () => {
    openModal()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y aplicar' }))

    // The page-rendered count (95) is not what the confirmation states.
    expect(
      await screen.findByText(
        'Se reemplazará la política de 37 materias activas. Esta acción queda en la auditoría.'
      )
    ).toBeTruthy()
    expect(mockGetCount).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar política' }))
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ applyToAllActiveSubjects: true, confirmedSubjectsCount: 37 })
    )
  })

  it('goes back without applying anything', async () => {
    openModal()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y aplicar' }))
    await screen.findByText(/Se reemplazará la política de 37 materias activas/)

    fireEvent.click(screen.getByRole('button', { name: 'Volver' }))
    expect(screen.queryByText(/Se reemplazará la política/)).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('asks again with the new count when it changed before confirming', async () => {
    mockUpdate.mockResolvedValue({
      success: false,
      error: 'La cantidad de materias activas cambió (ahora son 38). Revisa y confirma de nuevo.',
      currentCount: 38,
    })
    openModal()
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Revisar y aplicar' }))
    await screen.findByText(/37 materias activas/)
    fireEvent.click(screen.getByRole('button', { name: 'Sí, reemplazar política' }))

    expect(
      await screen.findByText(/Se reemplazará la política de 38 materias activas/)
    ).toBeTruthy()
  })
})
