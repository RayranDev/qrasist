import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { User } from '@supabase/supabase-js'
import AdminUserList from './AdminUserList'
import type { PostRoleChangeStep } from '@/lib/admin/roleChangeImpact'

// The heavy children are replaced by small markers: this test is about how
// AdminUserList hosts the post-role-change step, not about those components.
vi.mock('./RoleSelect', () => ({
  default: (props: {
    userId: string
    userName?: string
    onRoleChangeStep?: (u: { id: string; name: string; step: PostRoleChangeStep }) => void
  }) => (
    <>
      <button
        data-testid="trigger-assign"
        onClick={() =>
          props.onRoleChangeStep?.({
            id: props.userId,
            name: props.userName ?? '',
            step: 'assign-subjects',
          })
        }
      />
      <button
        data-testid="trigger-enroll"
        onClick={() =>
          props.onRoleChangeStep?.({
            id: props.userId,
            name: props.userName ?? '',
            step: 'enroll-subjects',
          })
        }
      />
    </>
  ),
}))
vi.mock('./AssignSubjectsDialog', () => ({
  default: (p: { professorId: string; onClose: () => void; onAssignCareers?: () => void }) => (
    <div role="dialog" aria-label="assign-dialog" data-id={p.professorId}>
      <button onClick={p.onAssignCareers}>Asignar carreras</button>
      <button onClick={p.onClose}>Omitir por ahora</button>
    </div>
  ),
}))
vi.mock('./EnrollSubjectsDialog', () => ({
  default: (p: { studentId: string; onClose: () => void; onAssignCareers?: () => void }) => (
    <div role="dialog" aria-label="enroll-dialog" data-id={p.studentId}>
      <button onClick={p.onAssignCareers}>Asignar carreras</button>
      <button onClick={p.onClose}>Omitir por ahora</button>
    </div>
  ),
}))
vi.mock('./UserComponents', () => ({
  CreateUserForm: () => null,
  ActionButtons: () => null,
  StudentHistoryModal: () => null,
  StudentCareersModal: (p: { studentId: string }) => (
    <div data-testid="student-careers-modal" data-id={p.studentId} />
  ),
  ProfessorCareersModal: (p: { professorId: string }) => (
    <div data-testid="professor-careers-modal" data-id={p.professorId} />
  ),
}))
vi.mock('./UserSearchBar', () => ({ default: () => null }))
vi.mock('./UserReportModal', () => ({ default: () => null }))

const profile = (id: string, role: 'ADMIN' | 'PROFESSOR' | 'STUDENT') => ({
  id,
  name: `Nombre ${id}`,
  first_name: 'Nombre',
  last_name: id,
  email: `${id}@urepublicana.edu.co`,
  role,
  student_code: null,
  is_active: true,
})

const baseProps = {
  currentUser: { id: 'admin-1' } as User,
  roleFilter: 'ALL' as const,
  statusFilter: 'active' as const,
  inactiveCount: 0,
  currentPage: 1,
  totalPages: 1,
  totalCount: 1,
  careers: [],
  studentCareers: [],
  professorCareers: [],
  searchQuery: '',
}

describe('AdminUserList role-change step host', () => {
  it('renders the assign dialog for the assign-subjects step', () => {
    render(<AdminUserList {...baseProps} users={[profile('u1', 'PROFESSOR')]} />)
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getAllByTestId('trigger-assign')[0])

    expect(screen.getByRole('dialog', { name: 'assign-dialog' }).getAttribute('data-id')).toBe('u1')
    expect(screen.queryByRole('dialog', { name: 'enroll-dialog' })).toBeNull()
  })

  it('renders the enroll dialog for the enroll-subjects step', () => {
    render(<AdminUserList {...baseProps} users={[profile('u2', 'STUDENT')]} />)

    fireEvent.click(screen.getAllByTestId('trigger-enroll')[0])

    expect(screen.getByRole('dialog', { name: 'enroll-dialog' }).getAttribute('data-id')).toBe('u2')
    expect(screen.queryByRole('dialog', { name: 'assign-dialog' })).toBeNull()
  })

  it('keeps the dialog open after the list refreshes and a role filter hides the row', () => {
    const { rerender } = render(
      <AdminUserList {...baseProps} users={[profile('u1', 'STUDENT')]} roleFilter="STUDENT" />
    )
    fireEvent.click(screen.getAllByTestId('trigger-assign')[0])
    expect(screen.getByRole('dialog', { name: 'assign-dialog' })).toBeTruthy()

    // Server refresh after the role change: the user is now a PROFESSOR, so the
    // STUDENT filter no longer returns the row.
    rerender(<AdminUserList {...baseProps} users={[]} totalCount={0} roleFilter="STUDENT" />)

    expect(screen.queryAllByTestId('trigger-assign')).toHaveLength(0)
    expect(screen.getByRole('dialog', { name: 'assign-dialog' }).getAttribute('data-id')).toBe('u1')
  })

  it('opens the PROFESSOR careers editor from the assign step and closes the dialog', () => {
    render(<AdminUserList {...baseProps} users={[profile('u1', 'PROFESSOR')]} />)
    fireEvent.click(screen.getAllByTestId('trigger-assign')[0])

    fireEvent.click(screen.getByRole('button', { name: 'Asignar carreras' }))

    expect(screen.getByTestId('professor-careers-modal').getAttribute('data-id')).toBe('u1')
    expect(screen.queryByTestId('student-careers-modal')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens the STUDENT careers editor from the enroll step and closes the dialog', () => {
    render(<AdminUserList {...baseProps} users={[profile('u2', 'STUDENT')]} />)
    fireEvent.click(screen.getAllByTestId('trigger-enroll')[0])

    fireEvent.click(screen.getByRole('button', { name: 'Asignar carreras' }))

    expect(screen.getByTestId('student-careers-modal').getAttribute('data-id')).toBe('u2')
    expect(screen.queryByTestId('professor-careers-modal')).toBeNull()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes the step dialog on "Omitir por ahora"', () => {
    render(<AdminUserList {...baseProps} users={[profile('u2', 'STUDENT')]} />)
    fireEvent.click(screen.getAllByTestId('trigger-enroll')[0])

    fireEvent.click(screen.getByRole('button', { name: 'Omitir por ahora' }))

    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
