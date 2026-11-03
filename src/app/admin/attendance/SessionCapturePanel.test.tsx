import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SessionCapturePanel from './SessionCapturePanel'
import type { SessionCaptureResult } from '@/lib/actions/attendanceCapture'

const mockGetData = vi.fn()

vi.mock('@/lib/actions/attendanceCapture', () => ({
  getSessionCaptureData: (...args: unknown[]) => mockGetData(...args),
}))

vi.mock('@/components/LocalTime', () => ({
  default: ({ date }: { date: string }) => <span>{date}</span>,
}))

const captured = {
  kind: 'captured' as const,
  ip: '1.1.1.1',
  latitude: 4.6,
  longitude: -74.1,
  distanceMeters: 20,
  ipDiffers: false,
  farAway: false,
}

const result: SessionCaptureResult = {
  success: true,
  applies: true,
  modality: 'PRESENCIAL',
  scheduledModality: null,
  rows: [
    {
      attendanceId: 'a1',
      studentName: 'Ana Pérez',
      studentCode: '111111111111',
      isGuest: false,
      status: 'PRESENT',
      scannedAt: '2026-03-02T13:59:00Z',
      capture: captured,
    },
    {
      attendanceId: 'a2',
      studentName: 'Luis Gómez',
      studentCode: '222222222222',
      isGuest: true,
      status: 'PRESENT',
      scannedAt: '2026-03-02T14:00:00Z',
      capture: { ...captured, ip: '9.9.9.9', ipDiffers: true, farAway: true, distanceMeters: 900 },
    },
  ],
}

describe('SessionCapturePanel', () => {
  beforeEach(() => {
    mockGetData.mockReset()
    mockGetData.mockResolvedValue(result)
  })

  it('does not request the data until the panel is opened', () => {
    render(<SessionCapturePanel sessionId="s1" />)

    expect(mockGetData).not.toHaveBeenCalled()
    expect(screen.queryByText('1.1.1.1')).toBeNull()
  })

  it('shows IP, location and the alerts once opened', async () => {
    render(<SessionCapturePanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /IP y ubicación/ }))

    expect(await screen.findByText('1.1.1.1')).toBeTruthy()
    expect(mockGetData).toHaveBeenCalledWith('s1')
    expect(screen.getByText('9.9.9.9')).toBeTruthy()
    expect(screen.getByText('distinta')).toBeTruthy()
    expect(screen.getByText('>300m')).toBeTruthy()
    expect(screen.getByText('Invitado')).toBeTruthy()
    expect(screen.getByText('1 alerta en esta clase')).toBeTruthy()
  })

  it('shows the neutral note instead of rows for a virtual class', async () => {
    mockGetData.mockResolvedValue({
      success: true,
      applies: false,
      rows: [],
      modality: 'VIRTUAL',
      scheduledModality: null,
    })
    render(<SessionCapturePanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /IP y ubicación/ }))

    expect(await screen.findByText('Clase virtual: no se captura IP ni ubicación')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('adds the schedule note when a virtual class was opened against a presencial schedule', async () => {
    mockGetData.mockResolvedValue({
      success: true,
      applies: false,
      rows: [],
      modality: 'VIRTUAL',
      scheduledModality: 'PRESENCIAL',
    })
    render(<SessionCapturePanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /IP y ubicación/ }))

    expect(await screen.findByText('Virtual (horario: presencial)')).toBeTruthy()
  })

  it('shows the error when the server refuses', async () => {
    mockGetData.mockResolvedValue({
      success: false,
      error: 'No tienes permiso para ver estos datos.',
    })
    render(<SessionCapturePanel sessionId="s1" />)

    fireEvent.click(screen.getByRole('button', { name: /IP y ubicación/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('No tienes permiso')
  })
})
