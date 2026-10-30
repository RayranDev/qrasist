import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CreateSubjectForm, SubjectsEmptyState } from './SubjectComponents'

vi.mock('@/lib/actions/adminSubjects', () => ({
  createSubject: vi.fn(),
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
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => vi.fn() }))

const periods = [{ id: 'p1', name: '2026-1' }]
const scrollIntoView = vi.fn()

function openForm() {
  fireEvent.click(screen.getByRole('button', { name: /Crear Nueva Materia/ }))
}

const formHeading = () => screen.queryByRole('heading', { name: 'Crear Nueva Materia' })

beforeEach(() => {
  scrollIntoView.mockClear()
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

  it('stays open while the view is unchanged (e.g. pagination)', () => {
    const { rerender } = render(<CreateSubjectForm periods={periods} resetKey="active|calc|" />)
    openForm()

    rerender(<CreateSubjectForm periods={periods} resetKey="active|calc|" />)
    expect(formHeading()).toBeInTheDocument()
  })

  it('still closes with Cancelar', () => {
    render(<CreateSubjectForm periods={periods} resetKey="active||" />)
    openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(formHeading()).not.toBeInTheDocument()
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
