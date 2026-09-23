/**
 * Valida el parámetro `next` que llega desde un enlace de correo
 * (recuperación de contraseña, confirmación, etc.) antes de redirigir.
 *
 * Solo se permiten rutas relativas que empiecen con "/" -- cualquier
 * otro valor (URL absoluta, protocolo distinto, "//host" que el
 * navegador interpreta como absoluto) se descarta para evitar un
 * open redirect, y se usa el fallback en su lugar.
 */
export function safeRedirectPath(next: string | null | undefined, fallback: string = '/'): string {
  if (!next) return fallback
  if (!next.startsWith('/')) return fallback
  // "//evil.com" o "/\evil.com" son absolutos para el navegador aunque
  // empiecen con "/" -- solo se acepta una barra simple seguida de algo
  // que no sea otra barra o backslash.
  if (next.startsWith('//') || next.startsWith('/\\')) return fallback
  return next
}
