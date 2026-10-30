import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CreateSubjectForm, SubjectsEmptyState } from './SubjectComponents'
import { buildSubjectsViewKey } from './subjectsViewKey'

const mockCreateSubject = vi.fn()
const mockToast = vi.fn()

vi.mock('@/lib/actions/adminSubjects', () => ({
  createSubject: (...a: unknown[]) => mockCreateSubject(...a),
  deleteSubject: vi.fn(),
  updateSubject: vi.fn(),
  reactivateSubject: vi.fn(),
  listSubjectSchedules: vi.fn(),
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
