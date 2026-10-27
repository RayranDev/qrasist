import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AssignSubjectsDialog from './AssignSubjectsDialog'

const mockList = vi.fn()
const mockAssign = vi.fn()
const mockToast = vi.fn()

vi.mock('@/lib/actions/adminSubjects', () => ({
  listSubjectsAssignableToProfessor: (...a: unknown[]) => mockList(...a),
  assignSubjectsToProfessor: (...a: unknown[]) => mockAssign(...a),
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
    <AssignSubjectsDialog
      professorId="prof-1"
      professorName="Luis Gómez"
      onClose={onClose}
      onAssignCareers={props.onAssignCareers}
    />
  )
  return onClose
}

describe('AssignSubjectsDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockList.mockResolvedValue(readyList)
  })

  it('renders an accessible dialog with the free subjects and an always-present skip button', async () => {
    renderDialog()

    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(await screen.findByText('Cálculo')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Omitir por ahora' })).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'Asignar materias' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('closes on skip and on Escape without assigning anything', async () => {
    const onClose = renderDialog()
    await screen.findByText('Cálculo')
    await waitFor(() => expect(document.activeElement).not.toBe(document.body))

    fireEvent.click(screen.getByRole('button', { name: 'Omitir por ahora' }))
    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(2)
    expect(mockAssign).not.toHaveBeenCalled()
  })

  it('assigns the selected subjects and closes on success', async () => {
    mockAssign.mockResolvedValue({ success: true, assigned: ['s1', 's2'], failures: [] })
    const onClose = renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.click(screen.getByRole('checkbox', { name: /MAT1/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /FIS1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Asignar 2 materias' }))

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith('prof-1', ['s1', 's2']))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(mockToast).toHaveBeenCalledWith('2 materias asignadas.', 'success')
  })

  it('shows per-subject failures and stays open', async () => {
    mockAssign.mockResolvedValue({
      success: false,
      error: 'No se asignó ninguna materia: revisa las que no se pueden asignar.',
      assigned: [],
      failures: [{ subjectId: 's1', code: 'MAT1', error: 'La materia ya tiene docente.' }],
    })
    const onClose = renderDialog()
    await screen.findByText('Cálculo')

    fireEvent.click(screen.getByRole('checkbox', { name: /MAT1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Asignar 1 materia' }))

    expect(await screen.findByText('MAT1: La materia ya tiene docente.')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('explains the missing careers and does not offer a picker', async () => {
    mockList.mockResolvedValue({ success: true, noCareers: true, subjects: [], total: 0 })
    const onAssignCareers = vi.fn()
    renderDialog({ onAssignCareers })

    expect(await screen.findByText(/todavía no tiene carreras asignadas/i)).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Asignar materias$/ })).toBeNull()
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

    await waitFor(() => expect(mockList).toHaveBeenLastCalledWith('prof-1', 'fis'))
  })
})
