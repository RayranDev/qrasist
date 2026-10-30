import { describe, it, expect } from 'vitest'
import { describeApproveAll, describeBulkResult, summarizeFailures } from './messages'

const fail = (id: string, message: string) => ({ id, message })

describe('summarizeFailures', () => {
  it('returns the single reason as is, without the trailing period', () => {
    expect(summarizeFailures([fail('1', 'Sin carrera.')])).toBe('Sin carrera')
  })

  it('groups equal reasons with a count, most frequent first', () => {
    const text = summarizeFailures([fail('1', 'A.'), fail('2', 'B.'), fail('3', 'B.')])

    expect(text).toBe('B (2); A (1)')
  })

  it('collapses the tail into "otros motivos"', () => {
    const text = summarizeFailures([fail('1', 'A'), fail('2', 'B'), fail('3', 'C'), fail('4', 'D')])

    expect(text).toBe('A (1); B (1); otros motivos (2)')
  })
})

describe('describeBulkResult', () => {
  it('is a success when everything went through', () => {
    const result = describeBulkResult({ action: 'approve', done: 3, failures: [] })

    expect(result).toEqual({ message: '3 solicitudes aprobadas.', type: 'success' })
  })

  it('uses the singular for one request', () => {
    expect(describeBulkResult({ action: 'reject', done: 1, failures: [] }).message).toBe(
      '1 solicitud rechazada.'
    )
  })

  it('summarizes a partial failure in one message', () => {
    const result = describeBulkResult({
      action: 'approve',
      done: 2,
      failures: [fail('1', 'Sin carrera.'), fail('2', 'Sin carrera.')],
    })

    expect(result.type).toBe('info')
    expect(result.message).toBe(
      '2 solicitudes aprobadas. 2 solicitudes no se pudieron aprobar: Sin carrera (2).'
    )
  })

  it('is an error when nothing succeeded', () => {
    const result = describeBulkResult({
      action: 'approve',
      done: 0,
      failures: [fail('1', 'Ya procesada.')],
    })

    expect(result.type).toBe('error')
    expect(result.message).toBe('1 solicitud no se pudo aprobar: Ya procesada.')
  })

  it('tells how many are left when an operation was capped', () => {
    const result = describeBulkResult({
      action: 'approve',
      done: 500,
      failures: [],
      remaining: 320,
    })

    expect(result.message).toContain('Quedan 320 solicitudes pendientes')
  })

  it('reports skipped requests in "approve all" as omitted and still pending', () => {
    const result = describeBulkResult({
      action: 'approve',
      done: 4,
      failures: [fail('1', 'Sin carrera.'), fail('2', 'Sin carrera.')],
      omitted: true,
    })

    expect(result.type).toBe('info')
    expect(result.message).toBe(
      '4 solicitudes aprobadas. 2 solicitudes omitidas (siguen pendientes): Sin carrera (2).'
    )
  })

  it('handles an empty run', () => {
    expect(describeBulkResult({ action: 'approve', done: 0, failures: [] }).message).toMatch(
      /no había solicitudes/i
    )
  })
})

describe('describeApproveAll', () => {
  it('states the exact count when it fits in one operation', () => {
    const { buttonLabel, message } = describeApproveAll(42, false)

    expect(buttonLabel).toBe('Aprobar todas (42)')
    expect(message).toContain('las 42 solicitudes pendientes')
    expect(message).toContain('otras páginas')
    expect(message).toContain('se omiten')
  })

  it('uses the singular for a single request', () => {
    expect(describeApproveAll(1, false).message).toMatch(/única solicitud/)
  })

  it('warns when only the oldest 500 will be approved', () => {
    const { message } = describeApproveAll(820, false)

    expect(message).toContain('Hay 820 solicitudes pendientes')
    expect(message).toContain('hasta 500, de las más antiguas')
    expect(message).toContain('se omiten')
  })

  it('marks the count as a lower bound when the scan was truncated', () => {
    const { buttonLabel, message } = describeApproveAll(5000, true)

    expect(buttonLabel).toBe('Aprobar todas (5000+)')
    expect(message).toContain('más de 5000')
  })
})
