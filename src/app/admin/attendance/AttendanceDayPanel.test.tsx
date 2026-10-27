import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AttendanceDayPanel from './AttendanceDayPanel'
import type { DaySession } from '@/lib/attendance/calendarData'

const session = (id: string, extra: Partial<DaySession> = {}): DaySession => ({
  id,
  subjectId: 's1',
  subjectName: `Materia ${id}`,
  subjectCode: id.toUpperCase(),
  date: '2026-10-05T13:00:00Z',
  modality: 'PRESENCIAL',
  isMakeup: false,
  isActive: true,
  expiresAt: null,
  suspendedAt: null,
  suspensionReason: null,
  registered: 2,
  enrolled: 5,
  ...extra,
})

const props = {
  month: '2026-10',
  now: new Date('2026-10-20T12:00:00Z'),
  filters: { subjectId: 's1' },
}

describe('AttendanceDayPanel', () => {
  it('lists the classes of the day with a count and asks to open one', () => {
    render(
      <AttendanceDayPanel
        {...props}
        selectedDay="2026-10-05"
        daySessions={[session('a'), session('b', { suspendedAt: '2026-10-01T00:00:00Z' })]}
      />
    )
    expect(screen.getByRole('heading', { name: /lunes, 5 de octubre de 2026/i })).toBeTruthy()
    expect(screen.getByText('1 clase, 1 suspendida')).toBeTruthy()
    expect(screen.getByText('Materia a')).toBeTruthy()
    expect(screen.getByText('Suspendida')).toBeTruthy()
    expect(screen.getByText('Elige una clase para ver a los inscritos.')).toBeTruthy()
  })

  it('links each class to its roster and marks the opened one', () => {
    render(
      <AttendanceDayPanel
        {...props}
        selectedDay="2026-10-05"
        daySessions={[session('a'), session('b')]}
        selectedSessionId="b"
      />
    )
    const links = screen.getAllByRole('link')
    expect(links).toHaveLength(2)
    for (const link of links) expect(link.getAttribute('href')).toMatch(/#roster-panel$/)
    expect(links[1].getAttribute('href')).toContain('sessionId=b')
    expect(links[1].getAttribute('href')).toContain('day=2026-10-05')
    expect(links[0].getAttribute('aria-current')).toBeNull()
    expect(links[1].getAttribute('aria-current')).toBe('true')
    expect(links[1].className).toContain('border-navy-600')
    expect(screen.getByText('(clase abierta)')).toBeTruthy()
    expect(screen.queryByText('Elige una clase para ver a los inscritos.')).toBeNull()
  })

  it('shows guidance when no day is selected or the day has no classes', () => {
    const { rerender } = render(
      <AttendanceDayPanel {...props} selectedDay={null} daySessions={[]} />
    )
    expect(screen.getByText('Elige un día del calendario')).toBeTruthy()
    rerender(<AttendanceDayPanel {...props} selectedDay="2026-10-06" daySessions={[]} />)
    expect(screen.getByText('No hay clases este día')).toBeTruthy()
    expect(screen.queryByText('Elige una clase para ver a los inscritos.')).toBeNull()
  })
})
