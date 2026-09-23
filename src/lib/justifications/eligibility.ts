/**
 * Reglas puras de elegibilidad para justificar una inasistencia.
 * Vive fuera de un archivo 'use server' a propósito: 'use server'
 * solo puede exportar funciones async (ver AGENTS.md de esta fase),
 * y estas son constantes + funciones síncronas que además se
 * importan tanto desde las server actions como desde el cliente
 * (formulario de justificación) para validar antes de enviar.
 */

// Ventana de envío: hasta 7 días calendario después de la fecha de
// la sesión. Pasado ese plazo, la falta ya no se puede justificar.
export const JUSTIFICATION_WINDOW_DAYS = 7

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
 * Ventana de 7 días calendario contados desde la fecha de la sesión
 * (no desde que quedó "held"), para que el estudiante no pueda
 * estirar el plazo dejando pasar tiempo antes de que expire el QR.
 */
export function isWithinJustificationWindow(
  sessionDate: string | Date,
  reference: Date = new Date()
): boolean {
  const sessionTime = new Date(sessionDate).getTime()
  const deadline = sessionTime + JUSTIFICATION_WINDOW_DAYS * 24 * 60 * 60 * 1000
  return reference.getTime() <= deadline
}

export function validateReasonLength(reason: string): string | null {
  const length = reason.trim().length
  if (length < 10) return 'El motivo debe tener al menos 10 caracteres.'
  if (length > 1000) return 'El motivo no puede superar los 1000 caracteres.'
  return null
}
