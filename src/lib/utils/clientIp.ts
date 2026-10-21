// IP del cliente para auditoria y rate limit. `x-forwarded-for` puede
// traer una lista ("cliente, proxy1, proxy2"): se usa solo la primera
// entrada, que es la del cliente. Vercel reescribe este header, pero si
// la app corre detras de otro proxy un cliente podria mandar una lista
// distinta en cada pedido para rotar la clave del rate limit.
export function getClientIp(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  const realIp = headers.get('x-real-ip')?.trim()
  return realIp || 'unknown'
}

// Coordenadas validas o nada: van a la base con service role (sin policy
// que las filtre), asi que se descarta cualquier valor no numerico o fuera
// de rango en vez de dejar que el insert falle.
export function sanitizeCoords(
  coords: { latitude?: unknown; longitude?: unknown } | null | undefined
): { latitude: number; longitude: number } | null {
  const lat = coords?.latitude
  const lon = coords?.longitude
  if (typeof lat !== 'number' || typeof lon !== 'number') return null
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null
  return { latitude: lat, longitude: lon }
}
