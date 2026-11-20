import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateSubjectForm, SubjectActionButtons, SubjectsEmptyState } from './SubjectComponents'
import { buildSubjectsViewKey } from './subjectsViewKey'
import { DEFAULT_GLOBAL_POLICY } from '@/lib/settings/globalPolicy'

const mockCreateSubject = vi.fn()
const mockToast = vi.fn()
const mockUpdateSubject = vi.fn()
const mockListSchedules = vi.fn()

vi.mock('@/lib/actions/adminSubjects', () => ({
  createSubject: (...a: unknown[]) => mockCreateSubject(...a),
  deleteSubject: vi.fn(),
  updateSubject: (...a: unknown[]) => mockUpdateSubject(...a),
  reactivateSubject: vi.fn(),
  listSubjectSchedules: (...a: unknown[]) => mockListSchedules(...a),
  addSubjectSchedule: vi.fn(),
  removeSubjectSchedule: vi.fn(),
}))
vi.mock('@/lib/actions/academic', () => ({
  assignSubjectToCareer: vi.fn(),
  removeSubjectFromCareer: vi.fn(),
}))
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => mockToast }))

const periods = [{ id: 'p1', name: '2026-1' }]
const scrollIntoView = vi.fn()

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /Crear Nueva Materia/ }))
}

const formHeading = () => screen.queryByRole('heading', { name: 'Crear Nueva Materia' })

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = scrollIntoView
})

describe('CreateSubjectForm view reset', () => {
  it('closes when the list view (status, search or filters) changes', () => {
    const { rerender } = render(<CreateSubjectForm periods={periods} resetKey="active||" />)
    openForm()
    expect(formHeading()).toBeInTheDocument()

    rerender(<CreateSubjectForm periods={periods} resetKey="inactive||" />)
    expect(formHeading()).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Crear Nueva Materia/ })).toBeInTheDocument()
  })

  it('stays open when only the page changes (pagination)', () => {
    const view = { status: 'active', q: 'calc' }
    // The page is not part of the view key, so a page change yields the same key.
    const { rerender } = render(
      <CreateSubjectForm periods={periods} resetKey={buildSubjectsViewKey(view)} />
    )
    openForm()
    fireEvent.change(screen.getByPlaceholderText('Ej. Cálculo I'), { target: { value: 'Física' } })

    rerender(<CreateSubjectForm periods={periods} resetKey={buildSubjectsViewKey({ ...view })} />)
    expect(formHeading()).toBeInTheDocument()
    expect(screen.getByPlaceholderText('Ej. Cálculo I')).toHaveValue('Física')
  })

  it('still closes with Cancelar', () => {
    render(<CreateSubjectForm periods={periods} resetKey="active||" />)
    openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(formHeading()).not.toBeInTheDocument()
  })
})

describe('CreateSubjectForm behavior', () => {
  it('closes after a successful submit', async () => {
    mockCreateSubject.mockResolvedValue({ success: true })
    render(<CreateSubjectForm periods={periods} resetKey="active" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('Ej. Cálculo I'), { target: { value: 'Física' } })
    fireEvent.change(screen.getByPlaceholderText('Ej. CALC-101'), { target: { value: 'FIS-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Materia' }))

    await waitFor(() => expect(formHeading()).not.toBeInTheDocument())
    expect(mockCreateSubject).toHaveBeenCalledTimes(1)
    expect(mockToast).toHaveBeenCalledWith('Materia "Física" creada.', 'success')
  })

  it('stays open and shows the error when the submit fails', async () => {
    mockCreateSubject.mockResolvedValue({ success: false, error: 'Código duplicado' })
    render(<CreateSubjectForm periods={periods} resetKey="active" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('Ej. Cálculo I'), { target: { value: 'Física' } })
    fireEvent.change(screen.getByPlaceholderText('Ej. CALC-101'), { target: { value: 'FIS-1' } })

    fireEvent.click(screen.getByRole('button', { name: 'Crear Materia' }))

    await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Código duplicado', 'error'))
    expect(formHeading()).toBeInTheDocument()
  })

  it('moves focus to the first field when opened by the toggle', () => {
    render(<CreateSubjectForm periods={periods} resetKey="active" />)
    openForm()
    expect(screen.getByPlaceholderText('Ej. Cálculo I')).toHaveFocus()
  })

  it('moves focus to the first field when opened from the empty state', () => {
    render(
      <>
        <CreateSubjectForm periods={periods} resetKey="active" />
        <SubjectsEmptyState archived={false} />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))
    expect(screen.getByPlaceholderText('Ej. Cálculo I')).toHaveFocus()
  })

  it('removes the window listener on unmount', () => {
    const add = vi.spyOn(window, 'addEventListener')
    const remove = vi.spyOn(window, 'removeEventListener')
    const { unmount } = render(<CreateSubjectForm periods={periods} resetKey="active" />)
    const added = add.mock.calls.find(([type]) => type === 'qrasist:open-create-subject')
    expect(added).toBeDefined()

    unmount()

    expect(remove).toHaveBeenCalledWith('qrasist:open-create-subject', added![1])
    add.mockRestore()
    remove.mockRestore()
  })

  it('uses instant scrolling when the user prefers reduced motion', () => {
    const original = window.matchMedia
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    try {
      render(
        <>
          <CreateSubjectForm periods={periods} resetKey="active" />
          <SubjectsEmptyState archived={false} />
        </>
      )
      fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
    } finally {
      window.matchMedia = original
    }
  })
})

describe('CreateSubjectForm policy', () => {
  it('inherits the global policy by default and shows its values read-only', () => {
    render(
      <CreateSubjectForm
        periods={periods}
        resetKey="active"
        globalPolicy={{ ...DEFAULT_GLOBAL_POLICY, lateAfterMinutes: 25 }}
      />
    )
    openForm()

    expect(screen.getByLabelText(/Usar política global/)).toBeChecked()
    expect(screen.getByTestId('inherited-policy').textContent).toMatch(/tardanza a los 25 min/)
    expect(screen.queryByLabelText(/Tolerancia de tardanza/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Motivo del cambio de política/)).not.toBeInTheDocument()
  })

  it('shows the policy fields and a required reason only for a custom policy', () => {
    render(<CreateSubjectForm periods={periods} resetKey="active" />)
    openForm()

    fireEvent.click(screen.getByLabelText(/Política personalizada/))

    expect(screen.getByLabelText(/Tolerancia de tardanza/)).toHaveValue(20)
    expect(screen.getByLabelText(/Motivo del cambio de política/)).toBeInTheDocument()
    expect(screen.queryByTestId('inherited-policy')).not.toBeInTheDocument()
  })

  it('submits policy_mode=global without policy fields by default', async () => {
    mockCreateSubject.mockResolvedValue({ success: true })
    render(<CreateSubjectForm periods={periods} resetKey="active" />)
    openForm()
    fireEvent.change(screen.getByPlaceholderText('Ej. Cálculo I'), { target: { value: 'Física' } })
    fireEvent.change(screen.getByPlaceholderText('Ej. CALC-101'), { target: { value: 'FIS-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear Materia' }))

    await waitFor(() => expect(mockCreateSubject).toHaveBeenCalledTimes(1))
    const fd = mockCreateSubject.mock.calls[0][0] as FormData
    expect(fd.get('policy_mode')).toBe('global')
    expect(fd.get('late_after_minutes')).toBeNull()
  })
})

describe('SubjectActionButtons edit dialog policy', () => {
  const subject = {
    id: 's1',
    name: 'Cálculo',
    code: 'CAL-1',
    professor_id: null,
    period_id: null,
    policy_override: false,
    late_after_minutes: 20,
    lates_per_absence: null,
    absence_rule_type: 'PERCENTAGE' as const,
    max_absence_percentage: 20,
    max_absence_count: null,
    total_planned_sessions: 16,
  }

  function openEditor(over: Record<string, unknown> = {}) {
    render(
      <SubjectActionButtons
        subject={{ ...subject, ...over } as typeof subject}
        professors={[]}
        periods={[]}
        subjectCareerIds={[]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /Editar Cálculo/ }))
  }
  const reopen = () => fireEvent.click(screen.getByRole('button', { name: /Editar Cálculo/ }))
  const guardar = () => screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement
  const dialogOpen = () => screen.queryByRole('dialog') !== null

  beforeEach(() => {
    mockListSchedules.mockResolvedValue({ success: true, schedules: [] })
  })

  it('requires a reason to enable Guardar and exposes why it is disabled', () => {
    openEditor()
    expect(guardar()).toBeEnabled()

    fireEvent.click(screen.getByLabelText(/Política personalizada/))
    expect(guardar()).toBeDisabled()
    const hint = document.getElementById(guardar().getAttribute('aria-describedby')!)
    expect(hint?.textContent).toMatch(/Escribe el motivo/)
    expect(screen.getByLabelText(/Motivo del cambio de política/)).toBeRequired()

    fireEvent.change(screen.getByLabelText(/Motivo del cambio de política/), {
      target: { value: 'abc' },
    })
    expect(guardar()).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Motivo del cambio de política/), {
      target: { value: 'Laboratorio con ingreso escalonado' },
    })
    expect(guardar()).toBeEnabled()
  })

  it('sends the reason, then starts the next edit without it or the previous values', async () => {
    mockUpdateSubject.mockResolvedValue({ success: true })
    openEditor()
    fireEvent.click(screen.getByLabelText(/Política personalizada/))
    fireEvent.change(screen.getByLabelText(/Tolerancia de tardanza/), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/Motivo del cambio de política/), {
      target: { value: 'Laboratorio con ingreso escalonado' },
    })
    fireEvent.click(guardar())

    await waitFor(() => expect(mockUpdateSubject).toHaveBeenCalledTimes(1))
    expect(mockUpdateSubject.mock.calls[0][1]).toMatchObject({
      policy_mode: 'custom',
      policy_reason: 'Laboratorio con ingreso escalonado',
      late_after_minutes: 10,
      max_absence_count: null,
    })
    await waitFor(() => expect(dialogOpen()).toBe(false))

    // Props did not change (still inheriting): the next edit must start clean.
    reopen()
    expect(screen.getByLabelText(/Usar política global/)).toBeChecked()
    fireEvent.click(screen.getByLabelText(/Política personalizada/))
    expect(screen.getByLabelText(/Motivo del cambio de política/)).toHaveValue('')
    expect(screen.getByLabelText(/Tolerancia de tardanza/)).toHaveValue(20)
    expect(guardar()).toBeDisabled()
  })

  it('drops unsaved edits on Cancelar', () => {
    openEditor()
    fireEvent.click(screen.getByLabelText(/Política personalizada/))
    fireEvent.change(screen.getByLabelText(/Motivo del cambio de política/), {
      target: { value: 'Algo escrito sin guardar' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(dialogOpen()).toBe(false)

    reopen()
    expect(screen.getByLabelText(/Usar política global/)).toBeChecked()
    fireEvent.click(screen.getByLabelText(/Política personalizada/))
    expect(screen.getByLabelText(/Motivo del cambio de política/)).toHaveValue('')
  })

  it('does not send a fixed count under the percentage rule', async () => {
    mockUpdateSubject.mockResolvedValue({ success: true })
    openEditor({ policy_override: true, max_absence_count: 7 })
    fireEvent.change(screen.getByLabelText(/Tolerancia de tardanza/), { target: { value: '15' } })
    fireEvent.change(screen.getByLabelText(/Motivo del cambio de política/), {
      target: { value: 'Ajuste acordado' },
    })
    fireEvent.click(guardar())

    await waitFor(() => expect(mockUpdateSubject).toHaveBeenCalledTimes(1))
    expect(mockUpdateSubject.mock.calls[0][1].max_absence_count).toBeNull()
  })

  it('announces a save error in an alert region and keeps the dialog open', async () => {
    mockUpdateSubject.mockResolvedValue({ success: false, error: 'No se pudo guardar' })
    openEditor()
    fireEvent.click(guardar())

    expect(await screen.findByText('No se pudo guardar')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar')
    expect(dialogOpen()).toBe(true)
  })
})

describe('SubjectsEmptyState', () => {
  it('hides the create action in the archived view', () => {
    render(<SubjectsEmptyState archived />)
    expect(screen.getByText('Ninguna materia coincide con tu búsqueda')).toBeInTheDocument()
    expect(screen.queryByText('Crear materia')).not.toBeInTheDocument()
    expect(screen.queryByText(/crea una materia nueva/)).not.toBeInTheDocument()
  })

  it('opens the create form and brings it into view in the active view', () => {
    render(
      <>
        <CreateSubjectForm periods={periods} resetKey="active||" />
        <SubjectsEmptyState archived={false} />
      </>
    )
    expect(formHeading()).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))

    expect(formHeading()).toBeInTheDocument()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('does not scroll later when the form is opened by hand after an external open', () => {
    render(
      <>
        <CreateSubjectForm periods={periods} resetKey="active||" />
        <SubjectsEmptyState archived={false} />
      </>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))
    // Already open: a second click only scrolls, it must not leave a pending flag.
    fireEvent.click(screen.getByRole('button', { name: 'Crear materia' }))
    expect(scrollIntoView).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    scrollIntoView.mockClear()
    openForm()
    expect(scrollIntoView).not.toHaveBeenCalled()
  })
})
