import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AttendanceSettingsModal from './AttendanceSettingsModal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/appSettings', () => ({ updateAppSettings: vi.fn() }))

const WARNING = /no podrán registrar tardanzas/

function openModal(props: { window: number; known?: number[] }) {
  render(
    <AttendanceSettingsModal
      initialRegistrationWindowMinutes={props.window}
      initialDefaultClassMinutes={120}
      knownLateAfterMinutes={props.known}
    />
  )
  fireEvent.click(screen.getByRole('button', { name: /Configuración de asistencia/ }))
}

const setWindow = (value: string) =>
  fireEvent.change(screen.getByLabelText(/Ventana de registro/), { target: { value } })

describe('AttendanceSettingsModal late-tracking warning', () => {
  it('shows no warning with the default window (30) and tolerance (20)', () => {
    openModal({ window: 30, known: [20] })

    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('warns when the window does not exceed the default tolerance', () => {
    openModal({ window: 5 })

    expect(screen.getByText(WARNING).textContent).toMatch(/tolerancia de 20 min o más/)
  })

  it('names the smallest unreachable tolerance and updates as the value is edited', () => {
    openModal({ window: 50, known: [20, 45, 90] })
    expect(screen.queryByText(WARNING)).toBeNull()

    setWindow('45')
    expect(screen.getByText(WARNING).textContent).toMatch(/tolerancia de 45 min o más/)

    setWindow('50')
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('does not warn about tolerances the window cannot be raised to cover (>= 60)', () => {
    openModal({ window: 30, known: [90, 60] })

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
