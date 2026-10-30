import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { ToastProvider } from '@/components/toast/ToastProvider'
import JustificationsList, { type JustificationRow } from './JustificationsList'

const mockReview = vi.fn()
const mockChange = vi.fn()
const mockBulk = vi.fn()

vi.mock('@/lib/actions/justifications', () => ({
  reviewJustification: (...args: unknown[]) => mockReview(...args),
  changeJustificationDecision: (...args: unknown[]) => mockChange(...args),
  bulkApproveJustifications: (...args: unknown[]) => mockBulk(...args),
  getJustificationAttachmentUrl: vi.fn(),
}))

function row(
  id: string,
  status: JustificationRow['status'],
  name = `Estudiante ${id}`,
  sessionDate = '2026-09-28T10:00:00Z'
) {
  return {
    id,
    reason: 'Cita médica en la EPS',
    attachment_path: null,
    status,
    review_note: null,
    reviewed_at: null,
    created_at: '2026-10-01T10:00:00Z',
    subject: { id: 's1', name: 'Cálculo', code: 'MAT101' },
    session: { id: `ses-${id}`, date: sessionDate },
    student: { name, student_code: '2020' },
  } satisfies JustificationRow
}

function renderList(rows: JustificationRow[], canReview = true) {
  return render(
    <ToastProvider>
      <JustificationsList justifications={rows} subjects={[]} canReview={canReview} />
    </ToastProvider>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('JustificationsList: change decision', () => {
  it('shows "Cambiar decisión" only on decided rows, only for admins', () => {
    renderList([row('a', 'APPROVED'), row('b', 'REJECTED'), row('c', 'PENDING')])
    expect(screen.getAllByRole('button', { name: 'Cambiar decisión' })).toHaveLength(2)
  })

  it('hides every review control in read-only mode (professor)', () => {
    renderList([row('a', 'APPROVED'), row('b', 'REJECTED'), row('c', 'PENDING')], false)
    expect(screen.queryByRole('button', { name: 'Cambiar decisión' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByText('Seleccionar todas')).toBeNull()
  })

  it('warns about the unjustified absence when leaving APPROVED and requires a reason', async () => {
    mockChange.mockResolvedValue({ success: true })
    renderList([row('a', 'APPROVED', 'Ana')])

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('alert').textContent).toMatch(/no justificada/)

    const confirm = within(dialog).getByRole('button', { name: 'Confirmar cambio' })
    expect((confirm as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Constancia inválida' },
    })
    fireEvent.click(confirm)

    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith({
        justificationId: 'a',
        to: 'REJECTED',
        reason: 'Constancia inválida',
      })
    )
    // Optimistic update: the row now reads as rejected and the modal closes.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Rechazada')).toBeTruthy()
    expect(screen.getByText('Constancia inválida')).toBeTruthy()
  })

  it('does not warn when moving a REJECTED row, and can send it back to PENDING', async () => {
    mockChange.mockResolvedValue({ success: true })
    renderList([row('b', 'REJECTED')])

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).queryByRole('alert')).toBeNull()

    fireEvent.click(within(dialog).getByLabelText(/Pendiente/))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Revisar de nuevo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }))

    await waitFor(() =>
      expect(mockChange).toHaveBeenCalledWith({
        justificationId: 'b',
        to: 'PENDING',
        reason: 'Revisar de nuevo',
      })
    )
    // Back to review: the row is selectable again.
    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeTruthy()
  })

  it('tells the admin the student sees the reason, or that it stays in the audit for PENDING', () => {
    renderList([row('a', 'APPROVED')])
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText(/El estudiante verá este motivo/)).toBeTruthy()
    fireEvent.click(within(dialog).getByLabelText(/Pendiente/))
    expect(within(dialog).getByText(/solo queda en la auditoría/)).toBeTruthy()
    expect(within(dialog).queryByText(/El estudiante verá este motivo/)).toBeNull()
  })

  it('warns that resubmitting is closed when rejecting a session outside the window', () => {
    renderList([row('a', 'APPROVED')]) // session from 2026-09-28: window long gone
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')

    expect(within(dialog).getByText(/El plazo para reenviar ya venció/)).toBeTruthy()
    // Not relevant when sending it back to review.
    fireEvent.click(within(dialog).getByLabelText(/Pendiente/))
    expect(within(dialog).queryByText(/El plazo para reenviar ya venció/)).toBeNull()
  })

  it('does not warn about the window when the session is still inside it', () => {
    renderList([row('a', 'APPROVED', 'Ana', new Date().toISOString())])
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    expect(screen.queryByText(/El plazo para reenviar ya venció/)).toBeNull()
  })

  it('keeps the row and shows the error when the server refuses the change', async () => {
    mockChange.mockResolvedValue({ success: false, error: 'La justificación cambió.' })
    renderList([row('a', 'APPROVED')])

    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Motivo válido' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }))

    expect(await screen.findByText('La justificación cambió.')).toBeTruthy()
    expect(screen.getByRole('dialog')).toBeTruthy()
    // The row behind the modal was not touched (no note was written).
    expect(screen.queryByText('Nota de revisión:')).toBeNull()
  })
})

describe('JustificationsList: bulk approve', () => {
  const pendings = () => [row('a', 'PENDING', 'Ana'), row('b', 'PENDING', 'Beto')]

  it('shows no bulk button until something is selected', () => {
    renderList(pendings())
    expect(screen.getByText('Seleccionar todas')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Aprobar seleccionadas/ })).toBeNull()
  })

  it('selects individual rows and shows the counter and button', () => {
    renderList(pendings())
    fireEvent.click(screen.getByLabelText('Seleccionar justificación de Ana'))
    expect(screen.getByText('1 seleccionada')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprobar seleccionadas (1)' })).toBeTruthy()
  })

  it('"Seleccionar todas" selects every pending row of the page and toggles off', () => {
    renderList([...pendings(), row('c', 'APPROVED', 'Carla')])
    const all = screen.getByLabelText('Seleccionar todas') as HTMLInputElement

    fireEvent.click(all)
    expect(screen.getByText('2 seleccionadas')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' })).toBeTruthy()

    fireEvent.click(all)
    expect(screen.queryByRole('button', { name: /Aprobar seleccionadas/ })).toBeNull()
  })

  it('asks for confirmation before approving and sends the selected ids', async () => {
    mockBulk.mockResolvedValue({ success: true, approved: ['a', 'b'], failures: [] })
    renderList(pendings())

    fireEvent.click(screen.getByLabelText('Seleccionar todas'))
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' }))
    expect(mockBulk).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(/Se aprobarán 2 justificaciones/)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }))

    await waitFor(() => expect(mockBulk).toHaveBeenCalledWith(['a', 'b']))
    expect(await screen.findByText('2 justificaciones aprobadas.')).toBeTruthy()
    expect(screen.getAllByText('Aprobada')).toHaveLength(2)
    expect(screen.queryByLabelText('Seleccionar todas')).toBeNull()
  })

  it('reports partial failures and only flips the rows the server approved', async () => {
    mockBulk.mockResolvedValue({
      success: true,
      approved: ['a'],
      failures: [{ id: 'b', message: 'Esta justificación ya fue revisada.' }],
    })
    renderList(pendings())

    fireEvent.click(screen.getByLabelText('Seleccionar todas'))
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar' }))

    expect(
      await screen.findByText(
        'Se aprobaron 1; 1 justificación no se pudo aprobar: Esta justificación ya fue revisada.'
      )
    ).toBeTruthy()
    expect(screen.getAllByText('Aprobada')).toHaveLength(1)
    expect(screen.getAllByText('Pendiente')).toHaveLength(1)
  })

  it('drops a row from the selection once it is decided, so it is not re-checked after going back to PENDING', async () => {
    mockReview.mockResolvedValue({ success: true })
    mockChange.mockResolvedValue({ success: true })
    renderList(pendings())

    fireEvent.click(screen.getByLabelText('Seleccionar justificación de Ana'))
    expect(screen.getByText('1 seleccionada')).toBeTruthy()

    // Approve Ana individually (the first "Aprobar" row button is Ana's).
    fireEvent.click(screen.getAllByRole('button', { name: 'Aprobar' })[0])
    await waitFor(() => expect(mockReview).toHaveBeenCalled())
    await waitFor(() => expect(screen.getAllByText('Aprobada')).toHaveLength(1))

    // Send her back to review.
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar decisión' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByLabelText(/Pendiente/))
    fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Revisar de nuevo' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const box = screen.getByLabelText('Seleccionar justificación de Ana') as HTMLInputElement
    expect(box.checked).toBe(false)
    expect(screen.queryByText(/seleccionada/)).toBeNull()
    expect(screen.queryByRole('button', { name: /Aprobar seleccionadas/ })).toBeNull()
  })

  it('shows the server error and keeps the rows pending when the whole call fails', async () => {
    mockBulk.mockResolvedValue({
      success: false,
      error: 'Solo coordinación puede revisar justificaciones.',
      approved: [],
      failures: [],
    })
    renderList(pendings())

    fireEvent.click(screen.getByLabelText('Seleccionar todas'))
    fireEvent.click(screen.getByRole('button', { name: 'Aprobar seleccionadas (2)' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Aprobar' }))

    expect(await screen.findByText('Solo coordinación puede revisar justificaciones.')).toBeTruthy()
    expect(screen.getAllByText('Pendiente')).toHaveLength(2)
  })
})
