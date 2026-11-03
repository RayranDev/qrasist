import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import HistoryDrillDown from './HistoryDrillDown'

vi.mock('@/components/toast/ToastProvider', () => ({ useToast: () => vi.fn() }))
vi.mock('@/lib/hooks/useRefreshAtClassEnd', () => ({ useRefreshAtClassEnd: () => {} }))
vi.mock('@/components/attendance/AttendanceRowActions', () => ({ default: () => null }))
vi.mock('./SubjectReportDownload', () => ({ default: () => null }))

const attendance = (id: string, ip: string | null, lat: number | null) => ({
  id,
  scanned_at: '2026-03-02T13:59:00Z',
  student_id: `st-${id}`,
  ip_address: ip,
  latitude: lat,
  longitude: lat === null ? null : -74.0817,
  status: 'PRESENT' as const,
  student: { name: `Estudiante ${id}`, student_code: id },
})

function subjectWith(modality: 'PRESENCIAL' | 'VIRTUAL' | null) {
  return {
    id: 'sub-1',
    name: 'Algoritmos',
    code: 'ALG',
    is_active: true,
    enrollments: [],
    sessions: [
      {
        id: 'ses-1',
        date: '2026-03-02T13:00:00Z',
        duration_minutes: 5,
        is_active: true,
        modality,
        latitude: modality === 'VIRTUAL' ? null : 4.6097,
        longitude: modality === 'VIRTUAL' ? null : -74.0817,
        can_edit: false,
        class_ended: true,
        attendances: [
          attendance('1', '1.1.1.1', 4.6098),
          attendance('2', '1.1.1.1', 4.6098),
          // different IP and ~2 km away: both alerts
          attendance('3', '9.9.9.9', 4.6297),
        ],
      },
    ],
  }
}

function openSession(modality: 'PRESENCIAL' | 'VIRTUAL' | null) {
  render(<HistoryDrillDown subjects={[subjectWith(modality)]} />)
  fireEvent.click(screen.getByText('Algoritmos'))
  fireEvent.click(screen.getByTestId('session-card-ses-1').firstElementChild as Element)
}

describe('HistoryDrillDown capture data', () => {
  it('shows IP, location and the alerts for an in-person class', () => {
    openSession('PRESENCIAL')

    expect(screen.getAllByText('1.1.1.1')).toHaveLength(2)
    expect(screen.getByText('9.9.9.9')).toBeTruthy()
    expect(screen.getByText('distinta')).toBeTruthy()
    expect(screen.getByText('>300m')).toBeTruthy()
    expect(screen.queryByText('Clase virtual: no se captura IP ni ubicación')).toBeNull()
  })

  it('keeps showing them for a legacy class without modality', () => {
    openSession(null)

    expect(screen.getByText('9.9.9.9')).toBeTruthy()
  })

  it('hides the columns, never flags and shows the note for a virtual class', () => {
    openSession('VIRTUAL')

    expect(screen.getByText('Clase virtual: no se captura IP ni ubicación')).toBeTruthy()
    expect(screen.queryByText('IP')).toBeNull()
    expect(screen.queryByText('Ubicación')).toBeNull()
    // even if the server sent historical values, nothing is rendered or flagged
    expect(screen.queryByText('1.1.1.1')).toBeNull()
    expect(screen.queryByText('9.9.9.9')).toBeNull()
    expect(screen.queryByText('distinta')).toBeNull()
    expect(screen.queryByText('>300m')).toBeNull()
  })
})
