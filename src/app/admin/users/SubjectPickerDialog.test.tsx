import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import SubjectPickerDialog, {
  type PickerListResult,
  type PickerSubmitResult,
  type PickerSubject,
} from './SubjectPickerDialog'

const mockToast = vi.fn()
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => mockToast }))

const subject = (n: number): PickerSubject => ({ id: `s${n}`, code: `C${n}`, name: `Materia ${n}` })
const ready = (
  subjects: PickerSubject[],
  extra: Partial<{ total: number; truncated: boolean }> = {}
) =>
  ({
    success: true,
    noCareers: false,
    subjects,
    total: extra.total ?? subjects.length,
    truncated: extra.truncated,
  }) as PickerListResult

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function setup(
  overrides: Partial<{
    loadSubjects: (term: string) => Promise<PickerListResult>
    submitSubjects: (ids: string[]) => Promise<PickerSubmitResult>
    onClose: () => void
  }> = {}
) {
  const loadSubjects = vi.fn(
    overrides.loadSubjects ?? (async () => ready([subject(1), subject(2)]))
  )
  const submitSubjects = vi.fn(
    overrides.submitSubjects ?? (async () => ({ success: true, done: ['s1'], failures: [] }))
  )
  const onClose = overrides.onClose ?? vi.fn()
  render(
    <SubjectPickerDialog
      titleId="picker-title"
      title="Elige materias"
      subtitle="Subtítulo"
      icon={<span />}
      noCareersMessage="Sin carreras"
      emptyMessage={(searching) => (searching ? 'Nada para tu búsqueda' : 'Nada disponible')}
      submitIdleLabel="Guardar"
      submitLabel={(n) => `Guardar ${n}`}
      successMessage={(n) => `${n} guardadas`}
      partialMessage={(n) => `${n} guardadas parcialmente`}
      loadSubjects={loadSubjects}
      submitSubjects={submitSubjects}
      onClose={onClose}
    />
  )
  return { loadSubjects, submitSubjects, onClose }
}

const searchBox = () => screen.getByLabelText('Buscar materia por código o nombre')

describe('SubjectPickerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores a stale search response that arrives after a newer one', async () => {
    const slow = deferred<PickerListResult>()
    const fast = deferred<PickerListResult>()
    const { loadSubjects } = setup({
      loadSubjects: vi
        .fn<(term: string) => Promise<PickerListResult>>()
        .mockResolvedValueOnce(ready([subject(1)]))
        .mockReturnValueOnce(slow.promise)
        .mockReturnValueOnce(fast.promise),
    })
    await screen.findByText('Materia 1')

    fireEvent.change(searchBox(), { target: { value: 'ma' } })
    await waitFor(() => expect(loadSubjects).toHaveBeenCalledTimes(2))
    fireEvent.change(searchBox(), { target: { value: 'mat' } })
    await waitFor(() => expect(loadSubjects).toHaveBeenCalledTimes(3))

    await act(async () => fast.resolve(ready([subject(3)])))
    expect(await screen.findByText('Materia 3')).toBeTruthy()

    await act(async () => slow.resolve(ready([subject(2)])))
    expect(screen.queryByText('Materia 2')).toBeNull()
    expect(screen.getByText('Materia 3')).toBeTruthy()
  })

  it('keeps the selection when a new search replaces the visible list', async () => {
    const { loadSubjects, submitSubjects } = setup({
      loadSubjects: vi
        .fn<(term: string) => Promise<PickerListResult>>()
        .mockResolvedValueOnce(ready([subject(1), subject(2)]))
        .mockResolvedValueOnce(ready([subject(3)])),
    })
    await screen.findByText('Materia 1')

    fireEvent.click(screen.getByRole('checkbox', { name: /C1/ }))
    fireEvent.change(searchBox(), { target: { value: 'zzz' } })
    await waitFor(() => expect(loadSubjects).toHaveBeenCalledTimes(2))
    await screen.findByText('Materia 3')
    expect(screen.queryByText('Materia 1')).toBeNull()

    fireEvent.click(screen.getByRole('checkbox', { name: /C3/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 2' }))

    await waitFor(() => expect(submitSubjects).toHaveBeenCalledWith(['s1', 's3']))
  })

  it('caps the selection at 50 and disables the remaining checkboxes', async () => {
    const many = Array.from({ length: 52 }, (_, i) => subject(i + 1))
    setup({ loadSubjects: async () => ready(many) })
    await screen.findByText('Materia 1')

    const boxes = () => screen.getAllByRole('checkbox') as HTMLInputElement[]
    boxes()
      .slice(0, 50)
      .forEach((box) => fireEvent.click(box))

    expect(boxes().filter((b) => b.checked)).toHaveLength(50)
    expect(boxes()[50].disabled).toBe(true)
    expect(boxes()[51].disabled).toBe(true)
    // Checked ones stay enabled so the admin can still unselect.
    expect(boxes()[0].disabled).toBe(false)

    fireEvent.click(boxes()[0])
    expect(boxes()[50].disabled).toBe(false)
  })

  it('submits once even if the button is clicked twice while submitting', async () => {
    const pending = deferred<PickerSubmitResult>()
    const { submitSubjects, onClose } = setup({ submitSubjects: () => pending.promise })
    await screen.findByText('Materia 1')

    fireEvent.click(screen.getByRole('checkbox', { name: /C1/ }))
    const button = screen.getByRole('button', { name: 'Guardar 1' })
    fireEvent.click(button)
    fireEvent.click(button)

    expect(submitSubjects).toHaveBeenCalledTimes(1)

    await act(async () => pending.resolve({ success: true, done: ['s1'], failures: [] }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockToast).toHaveBeenCalledWith('1 guardadas', 'success')
  })

  it('on a partial outcome tells how many were done, drops them from the selection and reloads', async () => {
    const { loadSubjects, onClose } = setup({
      loadSubjects: vi
        .fn<(term: string) => Promise<PickerListResult>>()
        .mockResolvedValueOnce(ready([subject(1), subject(2)]))
        .mockResolvedValueOnce(ready([subject(2)])),
      submitSubjects: async () => ({
        success: false,
        error: 'Se guardó 1 de 2.',
        done: ['s1'],
        failures: [{ subjectId: 's2', code: 'C2', error: 'Cambió mientras tanto.' }],
      }),
    })
    await screen.findByText('Materia 1')

    fireEvent.click(screen.getByRole('checkbox', { name: /C1/ }))
    fireEvent.click(screen.getByRole('checkbox', { name: /C2/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 2' }))

    expect(await screen.findByText('Se guardó 1 de 2.')).toBeTruthy()
    expect(screen.getByText('C2: Cambió mientras tanto.')).toBeTruthy()
    // A toast survives "Omitir por ahora", so the partial result is not lost.
    expect(mockToast).toHaveBeenCalledWith('1 guardadas parcialmente', 'success')
    await waitFor(() => expect(loadSubjects).toHaveBeenCalledTimes(2))
    expect(onClose).not.toHaveBeenCalled()
    // s1 is no longer selected; only s2 remains.
    expect(await screen.findByRole('button', { name: 'Guardar 1' })).toBeTruthy()
  })

  it('does not toast a partial result when nothing was applied', async () => {
    setup({
      submitSubjects: async () => ({
        success: false,
        error: 'No se guardó ninguna.',
        done: [],
        failures: [{ subjectId: 's1', code: 'C1', error: 'Ya tiene docente.' }],
      }),
    })
    await screen.findByText('Materia 1')

    fireEvent.click(screen.getByRole('checkbox', { name: /C1/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar 1' }))

    expect(await screen.findByText('C1: Ya tiene docente.')).toBeTruthy()
    expect(mockToast).not.toHaveBeenCalled()
  })

  it('shows the server error when the list fails to load', async () => {
    setup({ loadSubjects: async () => ({ success: false, error: 'Sin permiso.' }) })

    expect((await screen.findByRole('alert')).textContent).toBe('Sin permiso.')
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.getByRole('button', { name: 'Omitir por ahora' })).toBeTruthy()
  })

  it('shows a generic error when loading the list throws', async () => {
    setup({
      loadSubjects: async () => {
        throw new Error('network')
      },
    })

    expect((await screen.findByRole('alert')).textContent).toBe(
      'No se pudieron cargar las materias.'
    )
  })

  it('asks to narrow the search when the server list is truncated', async () => {
    setup({
      loadSubjects: async () => ready([subject(1)], { total: 500, truncated: true }),
    })

    expect(await screen.findByText('Hay más resultados, afina la búsqueda.')).toBeTruthy()
    expect(screen.getByText(/Mostrando 1 de 500 materias/)).toBeTruthy()
  })

  it('uses the searching variant of the empty message', async () => {
    setup({ loadSubjects: async () => ready([]) })
    expect(await screen.findByText('Nada disponible')).toBeTruthy()

    fireEvent.change(searchBox(), { target: { value: 'x' } })
    expect(await screen.findByText('Nada para tu búsqueda')).toBeTruthy()
  })
})
