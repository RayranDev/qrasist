export type JustificationStatus = 'PENDING' | 'APPROVED' | 'REJECTED'

const ACCENT: Record<JustificationStatus, string> = {
  PENDING: 'border-l-amber-400',
  APPROVED: 'border-l-emerald-500',
  REJECTED: 'border-l-red-500',
}

/**
 * Classes that visually delimit one excuse inside the list: a left accent bar
 * colored by status plus zebra striping. The reason box flips its own background
 * so it stays legible against the alternating row color.
 */
export function justificationRowStyle(status: JustificationStatus, index: number) {
  const striped = index % 2 === 1
  return {
    row: `border-l-4 ${ACCENT[status]} ${
      striped ? 'bg-gray-50/80' : 'bg-white'
    } hover:bg-navy-50/40 transition-colors`,
    reasonBox: striped ? 'bg-white border border-gray-200' : 'bg-gray-50 border border-gray-100',
  }
}
