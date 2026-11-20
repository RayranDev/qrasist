import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AttendanceSettingsModal from './AttendanceSettingsModal'
import { DEFAULT_GLOBAL_POLICY, type GlobalPolicy } from '@/lib/settings/globalPolicy'

const mockUpdate = vi.fn()
const mockRefresh = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))
vi.mock('@/lib/actions/appSettings', () => ({
  updateAppSettings: (...args: unknown[]) => mockUpdate(...args),
}))

const WARNING = /no podrán registrar tardanzas/

function openModal(props: {
  window: number
  custom?: number[]
  policy?: GlobalPolicy
  inheriting?: number
  customCount?: number
}) {
  render(
    <AttendanceSettingsModal
      initialRegistrationWindowMinutes={props.window}
      initialDefaultClassMinutes={120}
      initialPolicy={props.policy ?? DEFAULT_GLOBAL_POLICY}
      inheritingCount={props.inheriting ?? 0}
      customCount={props.customCount ?? 0}
      customLateAfterMinutes={props.custom}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /Configuración de asistencia/ }))
}

const setWindow = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Ventana de registro/), { target: { value } })
const setLate = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Tolerancia de tardanza/), { target: { value } })
const setReason = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Motivo del cambio/), { target: { value } })
const saveButton = () => screen.getByRole('button', { name: 'Guardar' }) as HTMLButtonElement

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AttendanceSettingsModal late-tracking warning', () => {
  it('shows no warning with the default window (30) and tolerance (20)', () => {
    openModal({ window: 30, custom: [20] })

    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('warns when the window does not exceed the global tolerance', () => {
    openModal({ window: 5 })

    expect(screen.getByText(WARNING).textContent).toMatch(/tolerancia de 20 min o más/)
  })

  it('names the smallest unreachable tolerance and updates as the value is edited', () => {
    openModal({ window: 50, custom: [45, 90] })
    expect(screen.queryByText(WARNING)).toBeNull()

    setWindow('45')
    expect(screen.getByText(WARNING).textContent).toMatch(/tolerancia de 45 min o más/)

    setWindow('50')
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('follows the tolerance being edited in the form', () => {
    openModal({ window: 30 })
    expect(screen.queryByText(WARNING)).toBeNull()

    setLate('40')
    expect(screen.getByText(WARNING).textContent).toMatch(/tolerancia de 40 min o más/)
  })

  it('does not warn about tolerances the window cannot be raised to cover (>= 60)', () => {
    openModal({ window: 30, custom: [90, 60] })

    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('stays quiet while the field is empty', () => {
    openModal({ window: 30 })

    setWindow('')

    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('keeps the live region in the DOM and toggles only its content', () => {
    openModal({ window: 30 })
    const region = screen.getByRole('status')
    expect(region.textContent).toBe('')

    setWindow('5')
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toMatch(WARNING)

    setWindow('30')
    expect(screen.getByRole('status')).toBe(region)
    expect(region.textContent).toBe('')
  })
})

describe('AttendanceSettingsModal global policy', () => {
  it('shows how many subjects inherit the policy and how many are custom', () => {
    openModal({ window: 30, inheriting: 90, customCount: 4 })

    expect(screen.getByText(/Materias activas que la heredan: 90/)).toBeTruthy()
    expect(screen.getByText(/Con política personalizada \(no cambian\): 4/)).toBeTruthy()
  })

  it('keeps Guardar disabled until something changes and a reason is typed', () => {
    openModal({ window: 30 })
    expect(saveButton().disabled).toBe(true)

    setLate('25')
    expect(saveButton().disabled).toBe(true)

    setReason('abc')
    expect(saveButton().disabled).toBe(true)

    setReason('Acuerdo de reunión')
    expect(saveButton().disabled).toBe(false)
  })

  it('sends the whole policy plus the reason, with null when tracking is turned off', async () => {
    mockUpdate.mockResolvedValue({
      success: true,
      changed: true,
      inheritingCount: 90,
      customCount: 3,
    })
    openModal({ window: 30 })

    fireEvent.click(screen.getByLabelText(/Sin seguimiento de tardanzas/))
    setReason('Se suspende el seguimiento')
    fireEvent.click(saveButton())

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate).toHaveBeenCalledWith({
      registrationWindowMinutes: 30,
      defaultClassMinutes: 120,
      qrRotationSeconds: 20,
      lateAfterMinutes: null,
      latesPerAbsence: null,
      absenceRuleType: 'PERCENTAGE',
      maxAbsencePercentage: 20,
      maxAbsenceCount: null,
      reason: 'Se suspende el seguimiento',
    })
    expect(
      await screen.findByText(
        /Materias que heredan la política: 90\. Con política personalizada \(sin cambios\): 3/
      )
    ).toBeTruthy()
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('edits the global QR rotation, needs a reason and sends it with the settings', async () => {
    mockUpdate.mockResolvedValue({
      success: true,
      changed: true,
      inheritingCount: 1,
      customCount: 0,
    })
    openModal({ window: 30 })
    const rotation = screen.getByLabelText(/Rotación del código QR/)
    expect(rotation).toHaveValue(20)
    expect(rotation).toHaveAttribute('min', '10')
    expect(rotation).toHaveAttribute('max', '60')
    // The helper says a shared photo can stay valid for about twice the interval.
    const helper = screen.getByText(/código actual y el anterior/)
    expect(helper.textContent).toMatch(/doble del intervalo \(≈40 s con 20 s, ≈120 s con 60 s\)/)

    fireEvent.change(rotation, { target: { value: '30' } })
    expect(saveButton().disabled).toBe(true)
    setReason('Acuerdo de la reunión')
    expect(saveButton().disabled).toBe(false)
    fireEvent.click(saveButton())

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      qrRotationSeconds: 30,
      reason: 'Acuerdo de la reunión',
    })
  })

  it('announces the server error in an alert region', async () => {
    mockUpdate.mockResolvedValue({ success: false, error: 'El motivo del cambio es obligatorio' })
    openModal({ window: 30 })

    setLate('25')
    setReason('Acuerdo de reunión')
    fireEvent.click(saveButton())

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /El motivo del cambio es obligatorio/
    )
  })

  it('exposes why Guardar is disabled and marks the reason as required', () => {
    openModal({ window: 30 })
    const describedBy = () =>
      document.getElementById(saveButton().getAttribute('aria-describedby') ?? '')?.textContent

    expect(describedBy()).toMatch(/Cambia algún valor/)

    setLate('25')
    expect(describedBy()).toMatch(/Escribe el motivo del cambio/)
    expect(screen.getByLabelText(/Motivo del cambio/)).toBeRequired()

    setReason('Acuerdo de reunión')
    expect(saveButton().hasAttribute('aria-describedby')).toBe(false)
  })

  it('reopens from the current values with an empty reason', () => {
    openModal({ window: 30 })
    setLate('25')
    setReason('Acuerdo de reunión')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Configuración de asistencia/ }))
    expect(screen.getByLabelText(/Tolerancia de tardanza/)).toHaveValue(20)
    expect(screen.getByLabelText(/Motivo del cambio/)).toHaveValue('')
  })

  it('sends a null fixed count while the rule is percentage, even with a leftover value', async () => {
    mockUpdate.mockResolvedValue({
      success: true,
      changed: true,
      inheritingCount: 1,
      customCount: 0,
    })
    openModal({ window: 30, policy: { ...DEFAULT_GLOBAL_POLICY, maxAbsenceCount: null } })
    fireEvent.change(screen.getByLabelText(/Regla de faltas/), { target: { value: 'FIXED_COUNT' } })
    fireEvent.change(screen.getByLabelText(/Límite de faltas \(cantidad\)/), {
      target: { value: '999' },
    })
    fireEvent.change(screen.getByLabelText(/Regla de faltas/), { target: { value: 'PERCENTAGE' } })
    setReason('Vuelve a porcentaje')
    setLate('25')
    fireEvent.click(saveButton())

    await waitFor(() => expect(mockUpdate).toHaveBeenCalledTimes(1))
    expect(mockUpdate.mock.calls[0][0]).toMatchObject({
      absenceRuleType: 'PERCENTAGE',
      maxAbsenceCount: null,
    })
  })

  it('switches the limit field with the absence rule', () => {
    openModal({ window: 30 })
    expect(screen.getByLabelText(/Límite de faltas \(%\)/)).toBeTruthy()

    fireEvent.change(screen.getByLabelText(/Regla de faltas/), { target: { value: 'FIXED_COUNT' } })
    expect(screen.getByLabelText(/Límite de faltas \(cantidad\)/)).toBeTruthy()
    expect(screen.queryByLabelText(/Límite de faltas \(%\)/)).toBeNull()
  })
})
