/**
 * Descarga en el navegador de un reporte generado por un route handler
 * (Excel o PDF). Devuelve el error del servidor para mostrarlo en un toast
 * en lugar de bajar un archivo con el JSON de error adentro.
 */
export type DownloadResult = { ok: true } | { ok: false; error: string }

export async function downloadReport(url: string, fallbackName: string): Promise<DownloadResult> {
  try {
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      return { ok: false, error: body?.error || 'No se pudo generar el reporte.' }
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
