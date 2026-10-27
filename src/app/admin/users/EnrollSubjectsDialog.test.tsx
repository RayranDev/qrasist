import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EnrollSubjectsDialog from './EnrollSubjectsDialog'

const mockList = vi.fn()
const mockEnroll = vi.fn()
const mockToast = vi.fn()

vi.mock('@/lib/actions/enrollments', () => ({
  listSubjectsEnrollableByStudent: (...a: unknown[]) => mockList(...a),
  enrollStudentInSubjects: (...a: unknown[]) => mockEnroll(...a),
}))
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => mockToast }))

const readyList = {
  success: true,
  noCareers: false,
  total: 2,
  subjects: [
    { id: 's1', code: 'MAT1', name: 'Cálculo' },
    { id: 's2', code: 'FIS1', name: 'Física' },
  ],
}

function renderDialog(props: { onClose?: () => void; onAssignCareers?: () => void } = {}) {
  const onClose = props.onClose ?? vi.fn()
  render(
    <EnrollSubjectsDialog
      studentId="st-1"
      studentName="Ana Pérez"
      onClose={onClose}
      onAssignCareers={props.onAssignCareers}
    />
  )
  return onClose
}

describe('EnrollSubjectsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(readyList)
  })

  it('renders an accessible dialog with the enrollable subjects and a skip button', async () => {
    renderDialog()

    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain('¿En qué materias se matriculará?')
    expect(await screen.findByText('Cálculo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Omitir por ahora' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Matricular en materias' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('shows "mostrando X de N" when the list is capped', async () => {
    mockList.mockResolvedValue({ ...readyList, total: 31 })
    renderDialog()

    expect(await screen.findByText(/Mostrando 2 de 31 materias/)).toBeTruthy()
  })

  it('skips on the button and on Escape without enrolling anything', async () => {
    const onClose = renderDialog()
    await screen.findByText('Cálculo')
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    fireEvent.click(screen.getByRole('button', { name: 'Omitir por ahora' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockEnroll).not.toHaveBeenCalled()
  })

  it('enrolls the selected subjects and closes on success', async () => {
    mockEnroll.mockResolvedValue({ success: true, enrolled: ['s1', 's2'], failures: [] })
    const onClose = renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.click(screen.getByRole('checkbox', { name: /MAT1/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /FIS1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Matricular en 2 materias' }))

    await waitFor(() => expect(mockEnroll).toHaveBeenCalledWith('st-1', ['s1', 's2']))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockToast).toHaveBeenCalledWith('2 matrículas creadas.', 'success')
  })

  it('shows per-subject failures and stays open', async () => {
    mockEnroll.mockResolvedValue({
      success: false,
      error: 'No se inscribió en ninguna materia: revisa las que no se pueden inscribir.',
      enrolled: [],
      failures: [{ subjectId: 's1', code: 'MAT1', error: 'El estudiante ya está inscrito.' }],
    })
    const onClose = renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.click(screen.getByRole('checkbox', { name: /MAT1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Matricular en 1 materia' }))

    expect(await screen.findByText('MAT1: El estudiante ya está inscrito.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('maps a partial outcome (enrolled) to a toast and keeps the dialog open', async () => {
    mockEnroll.mockResolvedValue({
      success: false,
      error: 'Se inscribió en 1 de 2 materias; revisa las que fallaron.',
      enrolled: ['s1'],
      failures: [{ subjectId: 's2', code: 'FIS1', error: 'No se pudo inscribir en esta materia.' }],
    })
    const onClose = renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.click(screen.getByRole('checkbox', { name: /MAT1/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /FIS1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Matricular en 2 materias' }))

    expect(await screen.findByText('FIS1: No se pudo inscribir en esta materia.')).toBeTruthy()
    expect(mockToast).toHaveBeenCalledWith(
      '1 matrícula creada; revisa las que fallaron.',
      'success'
    )
    expect(onClose).not.toHaveBeenCalled()
  })

  it('explains the missing careers and offers the careers editor instead of a picker', async () => {
    mockList.mockResolvedValue({ success: true, noCareers: true, subjects: [], total: 0 })
    const onAssignCareers = vi.fn()
    renderDialog({ onAssignCareers })

    expect(await screen.findByText(/todavía no tiene carreras asignadas/i)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /Matricular en/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Omitir por ahora' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Asignar carreras' }))
    expect(onAssignCareers).toHaveBeenCalled()
  })

  it('searches by code or name through the server action', async () => {
    renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.change(screen.getByLabelText('Buscar materia por código o nombre'), {
      target: { value: 'fis' },
    })

    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('st-1', 'fis'))
  })
})
