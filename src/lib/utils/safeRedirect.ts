/**
 * Valida el parámetro `next` que llega desde un enlace de correo
 * (recuperación de contraseña, confirmación, etc.) antes de redirigir.
 *
 * Solo se permiten rutas relativas al mismo origen. No alcanza con
 * chequear que el string empiece con "/": el parser WHATWG de `URL`
 * borra tabs y saltos de línea (U+0009, U+000A, U+000D) del input ANTES
 * de parsearlo, así que algo como "/\n/evil.com" -- que sí empieza con
 * una sola barra -- se convierte en "//evil.com" (protocol-relative) y
 * el navegador termina yendo a otro host. Por eso:
 *
 * 1. Se rechaza cualquier caracter de control de entrada, sin depender
 *    de que el parser lo maneje "bien".
 * 2. Se parsea con un origen placeholder fijo y se exige que el origen
 *    resultante sea EXACTAMENTE ese mismo -- así "//evil.com",
 *    "/\evil.com" (que el parser normaliza a "//evil.com" para
 *    esquemas especiales) o una URL absoluta como "https://evil.com"
 *    quedan afuera aunque hayan pasado el chequeo de caracteres.
 * 3. Se devuelve lo reconstruido desde el `URL` ya parseado, nunca el
 *    string crudo, para no reintroducir nada que el parser haya
 *    normalizado de forma distinta a como se lo interpretó.
 */

const PLACEHOLDER_ORIGIN = 'http://placeholder.internal'

const CONTROL_CHAR_RE = /[\u0000-\u001F\u007F]/

export function safeRedirectPath(next: string | null | undefined, fallback: string = '/'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  if (CONTROL_CHAR_RE.test(next)) return fallback

  let parsed: URL
  try {
    parsed = new URL(next, PLACEHOLDER_ORIGIN)
  } catch {
    return fallback
  }

  if (parsed.origin !== PLACEHOLDER_ORIGIN) return fallback

  return `${parsed.pathname}${parsed.search}${parsed.hash}`
}
