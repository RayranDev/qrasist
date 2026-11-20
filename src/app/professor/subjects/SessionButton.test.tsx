import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import SessionButton from './SessionButton'

const mockCreateSession = vi.fn()
const mockPush = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }))
vi.mock('@/lib/actions/session', () => ({
  createSession: (...args: unknown[]) => mockCreateSession(...args),
}))
vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => vi.fn() }))
vi.mock('@/lib/utils/geolocation', () => ({
  getBestEffortLocation: vi.fn(async () => null),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SessionButton', () => {
  it('shows no QR rotation control: the interval is a global setting for coordination', () => {
    render(<SessionButton subjectId="s1" registrationWindowMinutes={30} />)

    expect(screen.queryByText(/rotación/i)).toBeNull()
    expect(screen.queryByRole('spinbutton')).toBeNull()
    expect(screen.getByRole('button', { name: /Iniciar Sesión/ })).toBeInTheDocument()
  })

  it('creates the session without sending any rotation value', async () => {
    mockCreateSession.mockResolvedValue({ success: true, sessionId: 'sess-1' })
    render(<SessionButton subjectId="s1" registrationWindowMinutes={30} />)

    fireEvent.click(screen.getByRole('button', { name: /Iniciar Sesión/ }))

    await waitFor(() => expect(mockCreateSession).toHaveBeenCalledTimes(1))
    const args = mockCreateSession.mock.calls[0]
    expect(args).toHaveLength(3)
    expect(args[0]).toBe('s1')
    expect(args[2]).toMatchObject({ modality: 'PRESENCIAL', isMakeup: false })
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/professor/session/sess-1'))
  })
})
