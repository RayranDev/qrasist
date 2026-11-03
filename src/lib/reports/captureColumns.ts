/**
 * Columnas opcionales de IP y ubicación de los reportes de coordinación
 * ("Incluir IP y ubicación"). Puro: traduce una evaluación de captura (las
 * mismas alertas del historial del profesor y de la vista de coordinación) a
 * las celdas del Excel. Sin la opción, los reportes no usan nada de esto.
 */
import {
  SUSPICIOUS_DISTANCE_METERS,
  evaluateCapture,
  type CaptureEvaluation,
  type CaptureSession,
} from '@/lib/attendance/captureFlags'

export interface CaptureReportCells {
  ip: string
  latitude: number | ''
  longitude: number | ''
  distance: number | ''
  alert: string
}

/** Fila sin asistencia real (ausente, justificada, clase suspendida): todo en blanco. */
export const EMPTY_CAPTURE_CELLS: CaptureReportCells = {
  ip: '',
  latitude: '',
  longitude: '',
  distance: '',
  alert: '',
}

export const CAPTURE_VIRTUAL_LABEL = 'No aplica (clase virtual)'
export const CAPTURE_MANUAL_LABEL = 'No aplica (marca manual)'
export const CAPTURE_NO_IP_LABEL = 'Sin dato'

export const CAPTURE_NOTE =
  'Las columnas de IP y ubicación (IP, Latitud, Longitud, Distancia a la clase y Alerta) son datos personales que solo se capturan en clases presenciales: en las virtuales y en las marcas manuales figuran como "No aplica". La alerta "IP distinta" indica que la IP no coincide con la más repetida de esa clase; "Lejos de la clase" que la ubicación al escanear está a más de ' +
  `${SUSPICIOUS_DISTANCE_METERS} m de donde el profesor generó el código. Esta descarga queda registrada en la bitácora.`

export const CAPTURE_EXCEL_COLUMNS = [
  { header: 'IP', key: 'captureIp', width: 20 },
  { header: 'Latitud', key: 'captureLatitude', width: 12 },
  { header: 'Longitud', key: 'captureLongitude', width: 12 },
  { header: 'Distancia a la clase (m)', key: 'captureDistance', width: 22 },
  { header: 'Alerta', key: 'captureAlert', width: 34 },
]

export function captureCells(evaluation: CaptureEvaluation): CaptureReportCells {
  if (evaluation.kind === 'virtual') return { ...EMPTY_CAPTURE_CELLS, ip: CAPTURE_VIRTUAL_LABEL }
  if (evaluation.kind === 'manual') return { ...EMPTY_CAPTURE_CELLS, ip: CAPTURE_MANUAL_LABEL }

  const alerts: string[] = []
  if (evaluation.ipDiffers) alerts.push('IP distinta')
  if (evaluation.farAway) alerts.push(`Lejos de la clase (>${SUSPICIOUS_DISTANCE_METERS} m)`)

  return {
    ip: evaluation.ip ?? CAPTURE_NO_IP_LABEL,
    latitude: evaluation.latitude ?? '',
    longitude: evaluation.longitude ?? '',
    distance: evaluation.distanceMeters === null ? '' : Math.round(evaluation.distanceMeters),
    alert: alerts.join(' · '),
  }
}

/** Celdas de una asistencia real de una clase, ya comparada con el grupo de la clase. */
export function captureCellsFor(
  session: CaptureSession,
  attendance: { ip: string | null; latitude: number | null; longitude: number | null },
  groupIp: string | null
): CaptureReportCells {
  return captureCells(
    evaluateCapture(
      session,
      {
        ip_address: attendance.ip,
        latitude: attendance.latitude,
        longitude: attendance.longitude,
      },
      groupIp
    )
  )
}

/** Valores de las columnas de captura de una fila del Excel. */
export function captureRowValues(cells: CaptureReportCells | undefined) {
  const c = cells ?? EMPTY_CAPTURE_CELLS
  return {
    captureIp: c.ip,
    captureLatitude: c.latitude,
    captureLongitude: c.longitude,
    captureDistance: c.distance,
    captureAlert: c.alert,
  }
}
