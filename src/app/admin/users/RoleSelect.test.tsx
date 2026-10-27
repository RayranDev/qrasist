import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RoleSelect from './RoleSelect'
import { emptyRoleChangeImpact } from '@/lib/admin/roleChangeImpact'

const mockImpact = vi.fn()
const mockUpdate = vi.fn()
const mockToast = vi.fn()

vi.mock('@/lib/actions/admin', () => ({
  getRoleChangeImpact: (...a: unknown[]) => mockImpact(...a),
  updateUserRole: (...a: unknown[]) => mockUpdate(...a),
}))
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => mockToast }))

const studentWithEnrollments = {
  success: true,
  impact: {
    ...emptyRoleChangeImpact('STUDENT'),
    enrollments: { total: 2, subjects: [{ code: 'MAT1', name: 'Cálculo' }] },
  },
}

function renderSelect() {
  render(<RoleSelect userId="u1" currentRole="STUDENT" userName="Ana Pérez" />)
  return screen.getByLabelText('Rol del usuario') as HTMLSelectElement
}

describe('RoleSelect role change confirmation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdate.mockResolvedValue({ success: true, enrollmentsRemoved: 0 })
  })

  it('applies the change straight away when there is no impact', async () => {
    mockImpact.mockResolvedValue({ success: true, impact: emptyRoleChangeImpact('STUDENT') })
    const select = renderSelect()

    fireEvent.change(select, { target: { value: 'PROFESSOR' } })

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledWith('u1', 'PROFESSOR', undefined))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('asks for confirmation when the student is enrolled and keeps the current role on cancel', async () => {
    mockImpact.mockResolvedValue(studentWithEnrollments)
    const select = renderSelect()

    fireEvent.change(select, { target: { value: 'PROFESSOR' } })

    const dialog = await screen.findByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.textContent).toContain(
      'Al pasar a Docente, Ana Pérez dejará de ser estudiante y se desmatriculará de 2 materias'
    )
    expect(mockUpdate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(select.value).toBe('STUDENT')
  })

  it('closes the dialog with Escape without changing anything', async () => {
    mockImpact.mockResolvedValue(studentWithEnrollments)
    const select = renderSelect()
    fireEvent.change(select, { target: { value: 'PROFESSOR' } })
    await screen.findByRole('dialog')
    // Focus moves in from the same effect that registers the key listener, so
    // waiting for it means Escape is already wired up.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
    )

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(select.value).toBe('STUDENT')
  })

  it('moves focus to the cancel button when the dialog opens', async () => {
    mockImpact.mockResolvedValue(studentWithEnrollments)
    const select = renderSelect()
    fireEvent.change(select, { target: { value: 'PROFESSOR' } })
    await screen.findByRole('dialog')

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancelar' }))
    )
  })

  it('applies the change with the confirmation flag when the admin confirms', async () => {
    mockImpact.mockResolvedValue(studentWithEnrollments)
    mockUpdate.mockResolvedValue({ success: true, enrollmentsRemoved: 2 })
    const select = renderSelect()
    fireEvent.change(select, { target: { value: 'PROFESSOR' } })
    await screen.findByRole('dialog')

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar a Docente' }))

    await waitFor(() =>
      expect(mockUpdate).toHaveBeenCalledWith('u1', 'PROFESSOR', { unenroll: true })
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(mockToast).toHaveBeenCalledWith(
      'Rol actualizado a Docente. Se desmatriculó de 2 materias.',
      'success'
    )
  })

  it('offers the assign-subjects step after a successful change to PROFESSOR', async () => {
    mockImpact.mockResolvedValue({ success: true, impact: emptyRoleChangeImpact('STUDENT') })
    const onStep = vi.fn()
    render(
      <RoleSelect
        userId="u1"
        currentRole="STUDENT"
        userName="Ana Pérez"
        onRoleChangeStep={onStep}
      />
    )

    fireEvent.change(screen.getByLabelText('Rol del usuario'), { target: { value: 'PROFESSOR' } })

    await waitFor(() =>
      expect(onStep).toHaveBeenCalledWith({ id: 'u1', name: 'Ana Pérez', step: 'assign-subjects' })
    )
  })

  it('offers the enroll-subjects step after a successful change to STUDENT', async () => {
    mockImpact.mockResolvedValue({ success: true, impact: emptyRoleChangeImpact('PROFESSOR') })
    const onStep = vi.fn()
    render(
      <RoleSelect
        userId="u2"
        currentRole="PROFESSOR"
        userName="Luis Gómez"
        onRoleChangeStep={onStep}
      />
    )

    fireEvent.change(screen.getByLabelText('Rol del usuario'), { target: { value: 'STUDENT' } })

    await waitFor(() =>
      expect(onStep).toHaveBeenCalledWith({ id: 'u2', name: 'Luis Gómez', step: 'enroll-subjects' })
    )
  })

  it('offers no step for ADMIN or when the change fails', async () => {
    mockImpact.mockResolvedValue({ success: true, impact: emptyRoleChangeImpact('STUDENT') })
    const onStep = vi.fn()
    render(<RoleSelect userId="u1" currentRole="STUDENT" onRoleChangeStep={onStep} />)
    const select = screen.getByLabelText('Rol del usuario')

    mockUpdate.mockResolvedValueOnce({ success: false, error: 'nope' })
    fireEvent.change(select, { target: { value: 'PROFESSOR' } })
    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('nope', 'error'))

    fireEvent.change(select, { target: { value: 'ADMIN' } })
    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(2))
    expect(onStep).not.toHaveBeenCalled()
  })

  it('warns a professor that their subjects will be unlinked and reports it afterwards', async () => {
    mockImpact.mockResolvedValue({
      success: true,
      impact: {
        ...emptyRoleChangeImpact('PROFESSOR'),
        taughtSubjects: { total: 1, subjects: [{ code: 'FIS1', name: 'Física' }] },
      },
    })
    mockUpdate.mockResolvedValue({ success: true, enrollmentsRemoved: 0, subjectsUnassigned: 1 })
    render(<RoleSelect userId="u2" currentRole="PROFESSOR" userName="Luis Gómez" />)

    fireEvent.change(screen.getByLabelText('Rol del usuario'), { target: { value: 'STUDENT' } })

    const dialog = await screen.findByRole('dialog')
    expect(dialog.textContent).toContain(
      'Al pasar a Estudiante, Luis Gómez dejará de ser docente y se desvinculará de 1 materia: FIS1 Física. Quedará sin docente hasta que asignes uno.'
    )
    expect(mockUpdate).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Sí, cambiar a Estudiante' }))

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        'Rol actualizado a Estudiante. Se desvinculó de 1 materia como docente.',
        'success'
      )
    )
  })

  it('does not change anything when the impact check fails', async () => {
    mockImpact.mockResolvedValue({ success: false, error: 'boom' })
    const select = renderSelect()

    fireEvent.change(select, { target: { value: 'PROFESSOR' } })

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('boom', 'error'))
    expect(mockUpdate).not.toHaveBeenCalled()
    expect(select.value).toBe('STUDENT')
  })
})
