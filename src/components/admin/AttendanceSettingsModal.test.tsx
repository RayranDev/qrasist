import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AttendanceSettingsModal from './AttendanceSettingsModal'

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/lib/actions/appSettings', () => ({ updateAppSettings: vi.fn() }))

const WARNING = /nadie podrá registrarse como tarde/

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

describe('AttendanceSettingsModal late-tracking warning', () => {
  it('shows no warning with the default window (30) and tolerance (20)', () => {
    openModal({ window: 30, known: [20] })

    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('warns when the window does not exceed the default tolerance', () => {
    openModal({ window: 5 })

    expect(screen.getByText(WARNING).textContent).toMatch(/empieza a los 20 min/)
  })

  it('warns about a subject tolerance above the default and updates as the value is edited', () => {
    openModal({ window: 50, known: [20, 45] })
    expect(screen.queryByText(WARNING)).toBeNull()

    fireEvent.change(screen.getByLabelText(/Ventana de registro/), { target: { value: '45' } })
    expect(screen.getByText(WARNING).textContent).toMatch(/empieza a los 45 min/)

    fireEvent.change(screen.getByLabelText(/Ventana de registro/), { target: { value: '50' } })
    expect(screen.queryByText(WARNING)).toBeNull()
  })

  it('stays quiet while the field is empty', () => {
    openModal({ window: 30 })

    fireEvent.change(screen.getByLabelText(/Ventana de registro/), { target: { value: '' } })

    expect(screen.queryByText(WARNING)).toBeNull()
  })
})
