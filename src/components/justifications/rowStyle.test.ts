import { describe, expect, it } from 'vitest'
import { justificationRowStyle } from './rowStyle'

describe('justificationRowStyle', () => {
  it('colors the left accent by status', () => {
    expect(justificationRowStyle('PENDING', 0).row).toContain('border-l-amber-400')
    expect(justificationRowStyle('APPROVED', 0).row).toContain('border-l-emerald-500')
    expect(justificationRowStyle('REJECTED', 0).row).toContain('border-l-red-500')
  })

  it('alternates the row background and flips the reason box to keep contrast', () => {
    const even = justificationRowStyle('PENDING', 0)
    const odd = justificationRowStyle('PENDING', 1)
    expect(even.row).toContain('bg-white')
    expect(odd.row).toContain('bg-gray-50/80')
    expect(even.reasonBox).toContain('bg-gray-50')
    expect(odd.reasonBox).toContain('bg-white')
    expect(justificationRowStyle('PENDING', 2).row).toBe(even.row)
  })
})
