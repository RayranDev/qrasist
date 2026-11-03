/**
 * Alertas antifraude de la IP y la ubicación capturadas al registrar la
 * asistencia. Puro (sin I/O): lo comparten el historial del profesor, la vista
 * de coordinación y los reportes con IP y ubicación, para que los tres
 * muestren exactamente las mismas alertas.
 *
 * Reglas:
 *  - Clase virtual: no hay captura. Aunque la fila tenga valores guardados
 *    antes de este cambio, no se muestran ni se evalúan.
 *  - Marca manual (ip_address = 'manual'): no pasó por el escáner, no hay
 *    captura que evaluar.
 *  - "IP distinta": la IP no coincide con la más repetida de la clase (se
 *    necesita que al menos dos asistencias compartan IP para fijar el grupo).
 *  - "Lejos": la ubicación del estudiante está a más de 300 m de donde el
 *    profesor generó el código.
 */
import { sessionCapturesLocation } from './captureScope'

export const SUSPICIOUS_DISTANCE_METERS = 300

/** Valor que guarda attendanceManual en ip_address: no es una IP real. */
export const MANUAL_IP_MARKER = 'manual'

/** Valor de respaldo de getClientIp cuando no hay cabecera de IP. */
const UNKNOWN_IP = 'unknown'

export interface CaptureSession {
  modality?: string | null
  latitude: number | null
  longitude: number | null
}

export interface CaptureAttendance {
  ip_address: string | null
  latitude: number | null
  longitude: number | null
}

export type CaptureKind = 'captured' | 'virtual' | 'manual'

export interface CaptureEvaluation {
  kind: CaptureKind
  /** IP real, o null si no hay (virtual, manual o desconocida). */
  ip: string | null
  latitude: number | null
  longitude: number | null
  /** Metros hasta donde el profesor generó el código; null si falta alguna ubicación. */
  distanceMeters: number | null
  ipDiffers: boolean
  farAway: boolean
}

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function isRealIp(ip: string | null | undefined): ip is string {
  return !!ip && ip !== UNKNOWN_IP && ip !== MANUAL_IP_MARKER
}

/** IP más repetida de una clase; null si ninguna se repite (no hay "grupo"). */
export function mostCommonIp(ips: (string | null | undefined)[]): string | null {
  const counts = new Map<string, number>()
  for (const ip of ips) {
    if (!isRealIp(ip)) continue
    counts.set(ip, (counts.get(ip) || 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [ip, count] of counts) {
    if (count > bestCount) {
      best = ip
      bestCount = count
    }
  }
  return bestCount > 1 ? best : null
}

/** IP del grupo de una clase; null para clases virtuales (no hay captura). */
export function sessionGroupIp(
  session: Pick<CaptureSession, 'modality'>,
  attendances: Pick<CaptureAttendance, 'ip_address'>[]
): string | null {
  if (!sessionCapturesLocation(session.modality)) return null
  return mostCommonIp(attendances.map((a) => a.ip_address))
}

export function evaluateCapture(
  session: CaptureSession,
  attendance: CaptureAttendance,
  groupIp: string | null
): CaptureEvaluation {
  const blank = {
    ip: null,
    latitude: null,
    longitude: null,
    distanceMeters: null,
    ipDiffers: false,
    farAway: false,
  }
  if (!sessionCapturesLocation(session.modality)) return { kind: 'virtual', ...blank }
  if (attendance.ip_address === MANUAL_IP_MARKER) return { kind: 'manual', ...blank }

  const ip = isRealIp(attendance.ip_address) ? attendance.ip_address : null
  const hasBothCoords =
    session.latitude !== null &&
    session.longitude !== null &&
    attendance.latitude !== null &&
    attendance.longitude !== null
  const distance = hasBothCoords
    ? distanceMeters(
        session.latitude as number,
        session.longitude as number,
        attendance.latitude as number,
        attendance.longitude as number
      )
    : null

  return {
    kind: 'captured',
    ip,
    latitude: attendance.latitude,
    longitude: attendance.longitude,
    distanceMeters: distance,
    ipDiffers: groupIp !== null && ip !== null && ip !== groupIp,
    farAway: distance !== null && distance > SUSPICIOUS_DISTANCE_METERS,
  }
}

/** Evalúa todas las asistencias de una clase contra la IP de su grupo. */
export function evaluateSessionCapture<T extends CaptureAttendance>(
  session: CaptureSession,
  attendances: T[]
): { attendance: T; evaluation: CaptureEvaluation }[] {
  const groupIp = sessionGroupIp(session, attendances)
  return attendances.map((attendance) => ({
    attendance,
    evaluation: evaluateCapture(session, attendance, groupIp),
  }))
}
