import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadReport, SESSION_EXPIRED_MESSAGE } from './downloadReport'

function fakeResponse(init: {
  ok?: boolean
  status?: number
  redirected?: boolean
  contentType?: string
  disposition?: string
  json?: unknown
}) {
  const headers = new Map<string, string>()
  if (init.contentType) headers.set('Content-Type', init.contentType)
  if (init.disposition) headers.set('Content-Disposition', init.disposition)
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    redirected: init.redirected ?? false,
    headers: { get: (name: string) => headers.get(name) ?? null },
    json: async () => {
      if (init.json === undefined) throw new SyntaxError('not json')
      return init.json
    },
    blob: async () => new Blob(['%PDF-1.7']),
  }
}

describe('downloadReport', () => {
  const click = vi.fn()

  beforeEach(() => {
    click.mockReset()
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:fake'),
      revokeObjectURL: vi.fn(),
    })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('downloads a PDF using the server file name', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        fakeResponse({
          contentType: 'application/pdf',
          disposition: 'attachment; filename="reporte.pdf"',
        })
      )
    )
    expect(await downloadReport('/x', 'fallback.pdf')).toEqual({ ok: true })
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('does not save the login page when the session expired (redirected)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ redirected: true, contentType: 'text/html' }))
    )
    expect(await downloadReport('/x', 'fallback.pdf')).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    })
    expect(click).not.toHaveBeenCalled()
  })

  it('rejects a 200 that is not a report file even without a redirect flag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => fakeResponse({ contentType: 'text/html; charset=utf-8' }))
    )
    const result = await downloadReport('/x', 'fallback.xlsx')
    expect(result).toEqual({ ok: false, error: SESSION_EXPIRED_MESSAGE })
    expect(click).not.toHaveBeenCalled()
  })

  it('relays the server error message and treats 401 as an expired session', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          fakeResponse({ ok: false, status: 400, json: { error: 'El corte no pertenece.' } })
        )
        .mockResolvedValueOnce(fakeResponse({ ok: false, status: 401, json: { error: 'x' } }))
    )
    expect(await downloadReport('/x', 'f.pdf')).toEqual({
      ok: false,
      error: 'El corte no pertenece.',
    })
    expect(await downloadReport('/x', 'f.pdf')).toEqual({
      ok: false,
      error: SESSION_EXPIRED_MESSAGE,
    })
  })

  it('returns a generic error when the request itself fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('network')
      })
    )
    expect(await downloadReport('/x', 'f.pdf')).toEqual({
      ok: false,
      error: 'No se pudo generar el reporte.',
    })
  })
})
