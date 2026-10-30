import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import EnrollmentRequestsBoard from './EnrollmentRequestsBoard'
import { groupRequests, type PendingRequest } from '@/lib/enrollmentRequests/grouping'

const mockApprove = vi.fn()
const mockReject = vi.fn()
const mockApproveAll = vi.fn()
const mockToast = vi.fn()
const mockRefresh = vi.fn()

vi.mock('@/lib/actions/enrollmentRequests', () => ({
  approveEnrollmentRequests: (ids: string[]) => mockApprove(ids),
  rejectEnrollmentRequests: (ids: string[]) => mockReject(ids),
  approveAllEnrollmentRequests: (filters: unknown) => mockApproveAll(filters),
}))
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => mockToast }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

const req = (n: number, subject = 'A'): PendingRequest => ({
  id: `r${n}`,
  requestedAt: `2026-10-01T10:${String(n % 60).padStart(2, '0')}:00Z`,
  studentId: `st${n}`,
  studentName: `Estudiante ${n}`,
  studentCode: `${n}`,
  subjectId: `su-${subject}`,
  subjectName: `Materia ${subject}`,
  subjectCode: `M-${subject}`,
})

function renderBoard(
  requests: PendingRequest[],
  props: Partial<React.ComponentProps<typeof EnrollmentRequestsBoard>> = {}
) {
  return render(
    <EnrollmentRequestsBoard
      groups={groupRequests(requests, 'subject')}
      view="subject"
      totalMatching={requests.length}
      truncated={false}
      filters={{ q: '' }}
      canApproveAll
      {...props}
    />
  )
}

const checkboxFor = (name: RegExp) => screen.getByRole('checkbox', { name })
const button = (name: RegExp) => screen.getByRole('button', { name })

beforeEach(() => {
  mockApprove.mockReset()
  mockReject.mockReset()
  mockApproveAll.mockReset()
  mockToast.mockReset()
  mockRefresh.mockReset()
})

describe('EnrollmentRequestsBoard', () => {
  it('shows each group with its subject, code and pending count', () => {
    renderBoard([req(1, 'A'), req(2, 'A'), req(3, 'B')])

    const groupA = screen.getByRole('region', { name: 'Materia A' })
    expect(within(groupA).getByText('2 pendientes')).toBeTruthy()
    expect(within(groupA).getByText('M-A')).toBeTruthy()
    expect(within(groupA).getByText('Estudiante 1')).toBeTruthy()
    const groupB = screen.getByRole('region', { name: 'Materia B' })
    expect(within(groupB).getByText('1 pendiente')).toBeTruthy()
  })

  it('shows the student view with subjects as rows', () => {
    const requests = [req(1, 'A'), req(2, 'B')].map((r) => ({
      ...r,
      studentId: 'same',
      studentName: 'Ana',
    }))
    render(
      <EnrollmentRequestsBoard
        groups={groupRequests(requests, 'student')}
        view="student"
        totalMatching={2}
        truncated={false}
        filters={{ q: '' }}
        canApproveAll
      />
    )

    const group = screen.getByRole('region', { name: 'Ana' })
    expect(within(group).getByText('2 pendientes')).toBeTruthy()
    expect(within(group).getByText('Materia A')).toBeTruthy()
    expect(within(group).getByText('Materia B')).toBeTruthy()
  })

  it('counts the selection and disables the bulk buttons when nothing is selected', () => {
    renderBoard([req(1), req(2)])

    expect((button(/aprobar seleccionadas \(0\)/i) as HTMLButtonElement).disabled).toBe(true)
    expect((button(/rechazar seleccionadas \(0\)/i) as HTMLButtonElement).disabled).toBe(true)

    fireEvent.click(checkboxFor(/solicitud de Estudiante 1/))

    expect(screen.getByText('1 seleccionada')).toBeTruthy()
    expect((button(/aprobar seleccionadas \(1\)/i) as HTMLButtonElement).disabled).toBe(false)
  })

  it('selects every request of one group only, and marks the page checkbox as partial', () => {
    renderBoard([req(1, 'A'), req(2, 'A'), req(3, 'B')])

    fireEvent.click(checkboxFor(/todas las solicitudes de Materia A/))

    expect(screen.getByText('2 seleccionadas')).toBeTruthy()
    expect((checkboxFor(/solicitud de Estudiante 3/) as HTMLInputElement).checked).toBe(false)
    const page = checkboxFor(/de esta página/) as HTMLInputElement
    expect(page.indeterminate).toBe(true)
  })

  it('selects and clears the whole page', () => {
    renderBoard([req(1, 'A'), req(2, 'B')])
    const page = checkboxFor(/de esta página/) as HTMLInputElement

    fireEvent.click(page)
    expect(screen.getByText('2 seleccionadas')).toBeTruthy()
    expect(page.checked).toBe(true)

    fireEvent.click(page)
    expect(screen.getByText('2 solicitudes en esta página')).toBeTruthy()
  })

  it('asks for confirmation, approves the selection and removes it from the list', async () => {
    mockApprove.mockResolvedValue({ success: true, approved: ['r1', 'r2'], failures: [] })
    renderBoard([req(1), req(2), req(3)])
    fireEvent.click(checkboxFor(/solicitud de Estudiante 1/))
    fireEvent.click(checkboxFor(/solicitud de Estudiante 2/))

    fireEvent.click(button(/aprobar seleccionadas \(2\)/i))
    expect(mockApprove).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog').textContent).toContain('¿Aprobar 2 solicitudes?')

    fireEvent.click(button(/^aprobar \(2\)$/i))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(['r1', 'r2']))
    await waitFor(() => expect(screen.queryByText('Estudiante 1')).toBeNull())
    expect(screen.getByText('Estudiante 3')).toBeTruthy()
    expect(mockToast).toHaveBeenCalledWith('2 solicitudes aprobadas.', 'success')
    expect(mockRefresh).toHaveBeenCalled()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('summarizes a partial failure in one toast and keeps the failed rows', async () => {
    mockApprove.mockResolvedValue({
      success: true,
      approved: ['r1'],
      failures: [
        { id: 'r2', message: 'El estudiante no tiene ninguna carrera asignada.' },
        { id: 'r3', message: 'El estudiante no tiene ninguna carrera asignada.' },
      ],
    })
    renderBoard([req(1), req(2), req(3)])
    fireEvent.click(checkboxFor(/de esta página/))
    fireEvent.click(button(/aprobar seleccionadas \(3\)/i))
    fireEvent.click(button(/^aprobar \(3\)$/i))

    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith(
      '1 solicitud aprobada. 2 solicitudes no se pudieron aprobar: El estudiante no tiene ninguna carrera asignada (2).',
      'info'
    )
    expect(screen.queryByText('Estudiante 1')).toBeNull()
    expect(screen.getByText('Estudiante 2')).toBeTruthy()
    expect(screen.getByText('Estudiante 3')).toBeTruthy()
  })

  it('splits a large selection into batches of at most 100', async () => {
    mockApprove.mockImplementation(async (ids: string[]) => ({
      success: true,
      approved: ids,
      failures: [],
    }))
    const requests = Array.from({ length: 205 }, (_, i) => req(i + 1))
    renderBoard(requests)

    fireEvent.click(checkboxFor(/de esta página/))
    fireEvent.click(button(/aprobar seleccionadas \(205\)/i))
    fireEvent.click(button(/^aprobar \(205\)$/i))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledTimes(3))
    expect(mockApprove.mock.calls.map((c) => (c[0] as string[]).length)).toEqual([100, 100, 5])
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('205 solicitudes aprobadas.', 'success')
    )
  }, 20000)

  it('reports a rejected batch (action error) as failures for those ids', async () => {
    mockApprove.mockResolvedValue({
      success: false,
      error: 'No autenticado.',
      approved: [],
      failures: [],
    })
    renderBoard([req(1)])
    fireEvent.click(checkboxFor(/solicitud de Estudiante 1/))
    fireEvent.click(button(/aprobar seleccionadas \(1\)/i))
    fireEvent.click(button(/^aprobar \(1\)$/i))

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        '1 solicitud no se pudo aprobar: No autenticado.',
        'error'
      )
    )
    expect(screen.getByText('Estudiante 1')).toBeTruthy()
  })

  it('rejects the selection after confirming', async () => {
    mockReject.mockResolvedValue({ success: true, rejected: ['r2'], failures: [] })
    renderBoard([req(1), req(2)])
    fireEvent.click(checkboxFor(/solicitud de Estudiante 2/))

    fireEvent.click(button(/rechazar seleccionadas \(1\)/i))
    fireEvent.click(button(/^rechazar \(1\)$/i))

    await waitFor(() => expect(mockReject).toHaveBeenCalledWith(['r2']))
    await waitFor(() => expect(screen.queryByText('Estudiante 2')).toBeNull())
    expect(mockToast).toHaveBeenCalledWith('1 solicitud rechazada.', 'success')
  })

  it('approves a single row without confirmation', async () => {
    mockApprove.mockResolvedValue({ success: true, approved: ['r1'], failures: [] })
    renderBoard([req(1), req(2)])

    const row = screen.getByText('Estudiante 1').closest('li')!
    fireEvent.click(within(row).getByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(mockApprove).toHaveBeenCalledWith(['r1']))
  })

  it('approve all states the exact count of the current filters and sends those filters', async () => {
    mockApproveAll.mockResolvedValue({
      success: true,
      approved: ['r1', 'r2'],
      failures: [],
      total: 42,
      remaining: 0,
      truncated: false,
    })
    renderBoard([req(1), req(2)], {
      totalMatching: 42,
      filters: { q: 'ana', career: 'c-1' },
    })

    fireEvent.click(button(/aprobar todas \(42\)/i))
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('las 42 solicitudes pendientes')
    expect(dialog.textContent).toContain('otras páginas')
    expect(mockApproveAll).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprobar todas' }))

    await waitFor(() => expect(mockApproveAll).toHaveBeenCalledWith({ q: 'ana', career: 'c-1' }))
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('2 solicitudes aprobadas.', 'success')
    )
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('approve all warns when the operation limit applies and reports what is left', async () => {
    mockApproveAll.mockResolvedValue({
      success: true,
      approved: ['r1'],
      failures: [],
      total: 820,
      remaining: 320,
      truncated: false,
    })
    renderBoard([req(1)], { totalMatching: 820 })

    fireEvent.click(button(/aprobar todas \(820\)/i))
    expect(screen.getByRole('dialog').textContent).toContain('hasta 500, de las más antiguas')
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar todas' })
    )

    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    expect(mockToast.mock.calls[0][0]).toContain('Quedan 320 solicitudes pendientes')
  })

  it('shows an error toast when approve all fails', async () => {
    mockApproveAll.mockResolvedValue({
      success: false,
      error: 'No se pudieron cargar las solicitudes.',
      approved: [],
      failures: [],
      total: 0,
      remaining: 0,
      truncated: false,
    })
    renderBoard([req(1)])

    fireEvent.click(button(/aprobar todas/i))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar todas' })
    )

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith('No se pudieron cargar las solicitudes.', 'error')
    )
  })

  it('reports requests skipped by approve all as omitted and still pending', async () => {
    mockApproveAll.mockResolvedValue({
      success: true,
      approved: ['r1'],
      failures: [
        { id: 'r2', message: 'El estudiante no tiene ninguna carrera asignada.' },
        { id: 'r3', message: 'El estudiante no tiene ninguna carrera asignada.' },
      ],
      total: 3,
      remaining: 0,
      skipped: 2,
      truncated: false,
    })
    renderBoard([req(1), req(2), req(3)])

    fireEvent.click(button(/aprobar todas/i))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar todas' })
    )

    await waitFor(() => expect(mockToast).toHaveBeenCalled())
    expect(mockToast).toHaveBeenCalledWith(
      '1 solicitud aprobada. 2 solicitudes omitidas (siguen pendientes): El estudiante no tiene ninguna carrera asignada (2).',
      'info'
    )
  })

  it('labels the parts of a group split across pages with the real total', () => {
    const all = Array.from({ length: 5 }, (_, i) => req(i + 1))
    const [group] = groupRequests(all, 'subject')
    const second = { ...group, key: group.key + '#1', requests: all.slice(3), continued: true }
    const first = { ...group, requests: all.slice(0, 3) }

    const { unmount } = renderBoard([], { groups: [first] })
    const head = screen.getByRole('region', { name: 'Materia A' })
    expect(within(head).getByText('3 de 5 pendientes')).toBeTruthy()
    unmount()

    renderBoard([], { groups: [second] })
    const cont = screen.getByRole('region', { name: 'Materia A (continuación)' })
    expect(within(cont).getByText('2 de 5 pendientes')).toBeTruthy()
  })

  it('hides approve all when the screen does not offer it', () => {
    renderBoard([req(1)], { canApproveAll: false })

    expect(screen.queryByRole('button', { name: /aprobar todas/i })).toBeNull()
  })

  it('shows an empty state without requests', () => {
    renderBoard([])

    expect(screen.getByText('No hay solicitudes pendientes')).toBeTruthy()
  })

  it('shows a filtered empty state when filters are active', () => {
    renderBoard([], { filtered: true })

    expect(screen.getByText('Ninguna solicitud coincide con los filtros')).toBeTruthy()
  })
})
