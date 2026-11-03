import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logCaptureExport } from './captureExportAudit'

const mockLogAudit = vi.fn()
vi.mock('@/lib/audit/auditLog', () => ({
  logAudit: (...args: unknown[]) => mockLogAudit(...args),
}))

describe('logCaptureExport', () => {
  beforeEach(() => mockLogAudit.mockReset())

  it('records who, which report, the filters and the size, dropping empty filters', async () => {
    await logCaptureExport({
      actorId: 'admin-1',
      report: 'attendance-range',
      filters: { from: '2026-10-01', to: '2026-10-31', careerId: undefined, subjectId: 'sub-1' },
      rows: 42,
      subjectId: 'sub-1',
    })

    expect(mockLogAudit).toHaveBeenCalledWith({
      actorId: 'admin-1',
      action: 'report.export_capture_data',
      entityType: 'report',
      entityId: 'attendance-range',
      subjectId: 'sub-1',
      details: {
        report: 'attendance-range',
        format: 'xlsx',
        filters: { from: '2026-10-01', to: '2026-10-31', subjectId: 'sub-1' },
        rows: 42,
      },
    })
  })
})
