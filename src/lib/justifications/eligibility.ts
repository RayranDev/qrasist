/**
 * Reglas puras de elegibilidad para justificar una inasistencia.
 * Vive fuera de un archivo 'use server' a propósito: 'use server'
 * solo puede exportar funciones async (ver AGENTS.md de esta fase),
 * y estas son constantes + funciones síncronas que además se
 * importan tanto desde las server actions como desde el cliente
 * (formulario de justificación) para validar antes de enviar.
 */

import { addBusinessDaysBogota, endOfBogotaDay } from '@/lib/utils/businessDays'

// Ventana de envío (RF26): hasta 3 días HÁBILES después de la fecha de
// la sesión -- sin contar sábados, domingos ni festivos de Colombia.
// Pasado ese plazo, la falta ya no se puede justificar.
export const JUSTIFICATION_BUSINESS_DAYS = 3

export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

export type AllowedAttachmentMimeType = (typeof ALLOWED_ATTACHMENT_MIME_TYPES)[number]

const MIME_TO_EXTENSION: Record<AllowedAttachmentMimeType, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function isAllowedAttachmentMimeType(value: string): value is AllowedAttachmentMimeType {
  return (ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(value)
}

export function getAttachmentExtension(contentType: string): string | null {
  return isAllowedAttachmentMimeType(contentType) ? MIME_TO_EXTENSION[contentType] : null
}

/**
 * Validación de los metadatos de un adjunto ANTES de firmar la URL de
 * subida. La comparten la subida del estudiante y la del coordinador
 * (registro de excusa), para que ambas apliquen exactamente los mismos
 * límites.
 *
 * Defensa extra: la extensión del nombre original declarado por el
 * cliente debe coincidir con la que implica el contentType. No es
 * infalible (ambos vienen del cliente), pero evita el caso trivial de
 * un archivo "informe.exe" renombrado con un content-type falso.
 */
export function validateAttachmentMeta({
  fileName,
  contentType,
  size,
}: {
  fileName: string
  contentType: string
  size: number
}): { ok: true; extension: string } | { ok: false; error: string } {
  const extension = getAttachmentExtension(contentType)
  if (!extension) {
    return { ok: false, error: 'Formato no permitido. Usa PDF, JPG, PNG o WEBP.' }
  }

  const declaredExtension = fileName.split('.').pop()?.toLowerCase()
  if (
    !declaredExtension ||
    (declaredExtension === 'jpeg' ? 'jpg' : declaredExtension) !== extension
  ) {
    return { ok: false, error: 'La extensión del archivo no coincide con su tipo.' }
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { ok: false, error: 'El archivo no puede superar 5MB.' }
  }

  return { ok: true, extension }
}

/**
 * Una sesión es justificable cuando ya "pasó": el profesor la
 * archivó (is_active = false) o su ventana de QR (expires_at) ya
 * venció. Antes de eso no tiene sentido justificar una clase que
 * técnicamente todavía se puede escanear.
 */
export function isSessionAlreadyHeld(session: {
  is_active: boolean | null
  expires_at: string | null
}): boolean {
  if (session.is_active === false) return true
  if (!session.expires_at) return false
  return new Date(session.expires_at).getTime() < Date.now()
}

/**
 * Último instante en que el estudiante puede justificar una sesión: el
 * final (hora de Bogotá) del tercer día hábil posterior a la fecha de la
 * sesión. Se cuenta desde la fecha de la sesión (no desde que quedó
 * "held"), para que no se pueda estirar el plazo dejando pasar tiempo
 * antes de que expire el QR.
 */
export function getJustificationDeadline(sessionDate: string | Date): Date {
  const deadlineDay = addBusinessDaysBogota(new Date(sessionDate), JUSTIFICATION_BUSINESS_DAYS)
  return endOfBogotaDay(deadlineDay)
}

export function isWithinJustificationWindow(
  sessionDate: string | Date,
  reference: Date = new Date()
): boolean {
  return reference.getTime() <= getJustificationDeadline(sessionDate).getTime()
}

export function validateReasonLength(reason: string): string | null {
  const length = reason.trim().length
  if (length < 10) return 'El motivo debe tener al menos 10 caracteres.'
  if (length > 1000) return 'El motivo no puede superar los 1000 caracteres.'
  return null
}
