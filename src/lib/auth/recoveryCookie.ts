import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'

/**
 * Marca de "sesión de recuperación de contraseña válida".
 *
 * Por qué existe: `getUser()` por sí solo no alcanza para autorizar un
 * cambio de contraseña en /reset-password, porque CUALQUIER sesión
 * activa (una normal, no solo la que abre el enlace del correo) hace
 * que `getUser()` devuelva un usuario. Sin esta cookie, alguien con
 * acceso a una sesión ya abierta (ej. una compu compartida sin
 * bloquear) podría entrar directo a /reset-password y cambiar la
 * contraseña sin conocer la actual -- algo que updateOwnProfile sí
 * exige (ver src/lib/actions/profile.ts).
 *
 * Por qué está firmada (HMAC) y no es solo un valor cualquiera: si
 * fuera un valor fijo tipo "recovery=true", cualquiera podría crear esa
 * cookie a mano desde devtools y saltarse el chequeo. Se firma con HMAC
 * usando SUPABASE_SERVICE_ROLE_KEY -- un secreto que ya existe, vive
 * solo en el servidor y nunca se manda al cliente -- sobre
 * `${userId}.${expiresAt}`. Sin conocer ese secreto es computacionalmente
 * inviable producir una firma válida, así que la cookie no se puede
 * falsificar, y al incluir el userId queda atada a esa cuenta puntual
 * (copiarla a la sesión de otro usuario no sirve porque la firma no
 * coincide).
 *
 * TTL corto (10 min): solo tiene que durar lo que tarda la persona en
 * abrir el correo y completar el formulario.
 */

const COOKIE_NAME = 'qra_recovery'
const COOKIE_PATH = '/reset-password'
const TTL_MS = 10 * 60 * 1000

function getSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!secret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor.')
  }
  return secret
}

function sign(userId: string, expiresAt: number): string {
  return createHmac('sha256', getSecret()).update(`${userId}.${expiresAt}`).digest('hex')
}

export async function setRecoveryCookie(userId: string): Promise<void> {
  const expiresAt = Date.now() + TTL_MS
  const value = `${expiresAt}.${sign(userId, expiresAt)}`

  const cookieStore = await cookies()
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: COOKIE_PATH,
    maxAge: TTL_MS / 1000,
  })
}

/**
 * Pura (no toca cookies) para poder testear la lógica de verificación
 * sin mockear `next/headers`.
 */
export function verifyRecoveryCookieValue(rawValue: string | undefined, userId: string): boolean {
  if (!rawValue) return false

  const separatorIndex = rawValue.indexOf('.')
  if (separatorIndex === -1) return false

  const expiresAtRaw = rawValue.slice(0, separatorIndex)
  const signature = rawValue.slice(separatorIndex + 1)
  const expiresAt = Number(expiresAtRaw)
  if (!expiresAtRaw || !signature || Number.isNaN(expiresAt)) return false
  if (Date.now() > expiresAt) return false

  const expected = sign(userId, expiresAt)
  const expectedBuf = Buffer.from(expected, 'hex')
  const actualBuf = Buffer.from(signature, 'hex')
  if (expectedBuf.length === 0 || expectedBuf.length !== actualBuf.length) return false

  return timingSafeEqual(expectedBuf, actualBuf)
}

export async function hasValidRecoveryCookie(userId: string): Promise<boolean> {
  const cookieStore = await cookies()
  const raw = cookieStore.get(COOKIE_NAME)?.value
  return verifyRecoveryCookieValue(raw, userId)
}

export async function clearRecoveryCookie(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: COOKIE_NAME, path: COOKIE_PATH })
}
