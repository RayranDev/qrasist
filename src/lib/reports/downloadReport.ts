/**
 * Descarga en el navegador de un reporte generado por un route handler
 * (Excel o PDF). Devuelve el error del servidor para mostrarlo en un toast
 * en lugar de bajar un archivo con el JSON de error adentro.
 *
 * Con la sesión vencida el proxy redirige a /login y `fetch` sigue la
 * redirección: la respuesta llega con 200 pero es el HTML del login. Eso
 * nunca debe guardarse como .pdf/.xlsx, así que se exige que la respuesta
 * no haya sido redirigida y que el tipo de contenido sea el esperado.
 */
export type DownloadResult = { ok: true } | { ok: false; error: string }

export const SESSION_EXPIRED_MESSAGE = 'Tu sesión expiró. Vuelve a iniciar sesión.'

const REPORT_CONTENT_TYPES = ['application/pdf', 'application/vnd.openxmlformats-officedocument']

export function isSessionExpired(res: Pick<Response, 'redirected' | 'status'>): boolean {
  return res.redirected || res.status === 401
}

export async function downloadReport(url: string, fallbackName: string): Promise<DownloadResult> {
  try {
    const res = await fetch(url)
    if (isSessionExpired(res)) return { ok: false, error: SESSION_EXPIRED_MESSAGE }

    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return { ok: false, error: body?.error || 'No se pudo generar el reporte.' }
    }

    const contentType = res.headers.get('Content-Type') || ''
    if (!REPORT_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
      // Un 200 que no es un archivo de reporte casi siempre es la página de login.
      return { ok: false, error: SESSION_EXPIRED_MESSAGE }
    }

    const blob = await res.blob()
    const disposition = res.headers.get('Content-Disposition') || ''
    const filename = disposition.match(/filename="?([^"]+)"?/)?.[1] || fallbackName

    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(objectUrl)
    return { ok: true }
  } catch {
    return { ok: false, error: 'No se pudo generar el reporte.' }
  }
}
