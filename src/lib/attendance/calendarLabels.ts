import type { DaySummary } from './calendarGrid'

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** "3 clases" o "3 clases, 1 suspendida": dictadas primero, suspendidas aparte. */
export function countsLabel(c: DaySummary): string {
  const held = plural(c.held, 'clase', 'clases')
  return c.suspended > 0 ? `${held}, ${plural(c.suspended, 'suspendida', 'suspendidas')}` : held
}
