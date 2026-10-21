import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, fireEvent, waitFor } from '@testing-library/react'
import QRScanner from './QRScanner'

const TOKEN_A = '3f2b8c1e-5a4d-4e6f-9b7a-1c2d3e4f5a6b'
const TOKEN_B = '9a8b7c6d-1e2f-4a3b-8c4d-5e6f7a8b9c0d'

const mockRegister = vi.fn()
// One entry per Html5Qrcode.start() call: the "decoded a frame" callback.
const decoders: Array<(text: string) => void> = []

vi.mock('html5-qrcode', () => ({
  Html5Qrcode: class {
    isScanning = false
    async start(_camera: unknown, _config: unknown, onSuccess: (text: string) => void) {
      this.isScanning = true
      decoders.push(onSuccess)
    }
    async stop() {
      this.isScanning = false
    }
  },
}))

vi.mock('@/lib/actions/attendance', () => ({
  registerAttendance: (...args: unknown[]) => mockRegister(...args),
}))

vi.mock('@/lib/utils/geolocation', () => ({
  getBestEffortLocation: vi.fn(async () => null),
}))

const okResult = {
  ok: true,
  message: 'ok',
  data: {
    subjectName: 'Algoritmos',
    subjectCode: 'ALG',
    time: '08:59 a. m.',
    isGuest: false,
    isLate: false,
  },
}

async function waitForDecoder(count: number) {
  await waitFor(() => expect(decoders.length).toBe(count))
}

describe('QRScanner', () => {
  beforeEach(() => {
    decoders.length = 0
    mockRegister.mockReset()
    mockRegister.mockResolvedValue(okResult)
  })

  it('sends exactly one registerAttendance call when the camera decodes many frames', async () => {
    render(<QRScanner />)
    await waitForDecoder(1)

    // html5-qrcode keeps calling the success callback (10 fps) until stop() resolves.
    await act(async () => {
      for (let i = 0; i < 25; i++) decoders[0](TOKEN_A)
    })

    expect(await screen.findByText('¡Asistencia Confirmada!')).toBeInTheDocument()
    expect(mockRegister).toHaveBeenCalledTimes(1)
    expect(mockRegister).toHaveBeenCalledWith(TOKEN_A, undefined)
  })

  it('keeps the first result even if later frames arrive after the response', async () => {
    render(<QRScanner />)
    await waitForDecoder(1)

    await act(async () => {
      decoders[0](TOKEN_A)
    })
    await screen.findByText('¡Asistencia Confirmada!')
    await act(async () => {
      decoders[0](TOKEN_A)
      decoders[0](TOKEN_A)
    })

    expect(screen.getByText('¡Asistencia Confirmada!')).toBeInTheDocument()
    expect(mockRegister).toHaveBeenCalledTimes(1)
  })

  it('accepts a new scan after "Escanear otro código"', async () => {
    render(<QRScanner />)
    await waitForDecoder(1)
    await act(async () => {
      for (let i = 0; i < 5; i++) decoders[0](TOKEN_A)
    })
    await screen.findByText('¡Asistencia Confirmada!')

    fireEvent.click(screen.getByRole('button', { name: 'Escanear otro código' }))
    await waitForDecoder(2)
    await act(async () => {
      for (let i = 0; i < 5; i++) decoders[1](TOKEN_B)
    })

    await waitFor(() => expect(mockRegister).toHaveBeenCalledTimes(2))
    expect(mockRegister).toHaveBeenLastCalledWith(TOKEN_B, undefined)
  })

  it('accepts a new scan after "Volver a escanear" on an error', async () => {
    mockRegister.mockResolvedValueOnce({ ok: false, code: 'EXPIRED', message: 'Expirado' })
    render(<QRScanner />)
    await waitForDecoder(1)
    await act(async () => {
      for (let i = 0; i < 5; i++) decoders[0](TOKEN_A)
    })
    await screen.findByText('Expirado')

    fireEvent.click(screen.getByRole('button', { name: 'Volver a escanear' }))
    await waitForDecoder(2)
    await act(async () => {
      decoders[1](TOKEN_B)
    })

    expect(await screen.findByText('¡Asistencia Confirmada!')).toBeInTheDocument()
    expect(mockRegister).toHaveBeenCalledTimes(2)
  })

  it('retries the last token once after a network failure', async () => {
    mockRegister.mockRejectedValueOnce(new Error('network'))
    render(<QRScanner />)
    await waitForDecoder(1)
    await act(async () => {
      for (let i = 0; i < 5; i++) decoders[0](TOKEN_A)
    })
    await screen.findByText(/Fallo de red/)
    expect(mockRegister).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /Reintentar registro/ }))

    expect(await screen.findByText('¡Asistencia Confirmada!')).toBeInTheDocument()
    expect(mockRegister).toHaveBeenCalledTimes(2)
    expect(mockRegister).toHaveBeenLastCalledWith(TOKEN_A, undefined)
  })
})
