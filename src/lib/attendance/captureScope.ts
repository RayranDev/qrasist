/**
 * Alcance de la captura de IP y ubicación (GPS). Fuente única de verdad:
 * solo las clases presenciales recogen estos datos. En una clase virtual no se
 * guardan ni se muestran, porque son datos personales sin una razón
 * antifraude que los justifique (el estudiante está en su casa).
 *
 * Regla:
 *  - 'VIRTUAL'    -> NO se captura.
 *  - 'PRESENCIAL' -> se captura.
 *  - null         -> se captura: sesiones anteriores a la migración 026 o creadas
 *                    por quien no indicó modalidad (se tratan como presenciales).
 */
export type CaptureModality = 'PRESENCIAL' | 'VIRTUAL'

export function sessionCapturesLocation(modality: string | null | undefined): boolean {
  return modality !== 'VIRTUAL'
}

export const VIRTUAL_NO_CAPTURE_NOTE = 'Clase virtual: no se captura IP ni ubicación'

interface CaptureFields {
  ip_address: string | null
  latitude: number | null
  longitude: number | null
}

/**
 * Quita IP y coordenadas de una asistencia de una clase virtual. Sirve tanto
 * para los datos que llegan del cliente como para las filas históricas que ya
 * tuvieran valores: se aplica al leer, sin tocar lo guardado.
 */
export function redactCaptureFields<T extends CaptureFields>(
  modality: string | null | undefined,
  row: T
): T {
  if (sessionCapturesLocation(modality)) return row
  return { ...row, ip_address: null, latitude: null, longitude: null }
}

/**
 * Columnas a limpiar cuando una asistencia YA guardada pasa a una clase
 * virtual (reubicación manual, reposición tras una suspensión): sin esto la fila
 * conservaría la IP y la ubicación que se capturaron en la clase de origen.
 * El marcador 'manual' de ip_address no es una IP real y se conserva.
 * Devuelve null si la clase destino captura (no hay nada que limpiar).
 */
export function captureResetForMove(
  targetModality: string | null | undefined,
  currentIp: string | null
): { ip_address: string | null; latitude: null; longitude: null } | null {
  if (sessionCapturesLocation(targetModality)) return null
  return {
    ip_address: currentIp === 'manual' ? 'manual' : null,
    latitude: null,
    longitude: null,
  }
}
