import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectPath } from '@/lib/utils/safeRedirect'
import { setRecoveryCookie } from '@/lib/auth/recoveryCookie'
import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Tipos de OTP por correo que esta app efectivamente usa/soporta. Se
 * valida contra esta lista ANTES de llamar a `verifyOtp` -- pasarle un
 * `type` arbitrario que llega de un query param a la API de Supabase
 * sin validar es innecesario (no hay ningún flujo que use, por ej.,
 * 'phone_change' vía este endpoint) y un valor inesperado ahí no debe
 * intentarse verificar, debe tratarse directo como enlace inválido.
 */
const ALLOWED_OTP_TYPES: EmailOtpType[] = [
  'recovery',
  'email',
  'signup',
  'invite',
  'magiclink',
  'email_change',
]

function isAllowedOtpType(value: string | null): value is EmailOtpType {
  return !!value && (ALLOWED_OTP_TYPES as string[]).includes(value)
}

/**
 * Punto único de confirmación de enlaces de correo (recuperación de
 * contraseña, y a futuro invitación/cambio de email). Soporta los dos
 * formatos que Supabase puede generar según la plantilla de email:
 *
 * - `token_hash` + `type`: formato recomendado -- se verifica con
 *   `verifyOtp` sin salir nunca de nuestro propio dominio.
 * - `code`: formato PKCE de `exchangeCodeForSession`, usado si la
 *   plantilla de Supabase quedó con `{{ .ConfirmationURL }}` por defecto.
 *
 * Ver docs/SUPABASE_AUTH_SETUP.md para configurar la plantilla.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const rawType = searchParams.get('type')
  const code = searchParams.get('code')
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard')

  const supabase = await createClient()
  let verified = false
  let userId: string | null = null
  let isRecovery = false

  if (tokenHash && isAllowedOtpType(rawType)) {
    const { data, error } = await supabase.auth.verifyOtp({
      type: rawType,
      token_hash: tokenHash,
    })
    verified = !error
    userId = data.user?.id ?? null
    isRecovery = rawType === 'recovery'
  } else if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    verified = !error
    userId = data.user?.id ?? null
    // El flujo PKCE (`code`) no trae el tipo de verificación -- se
    // infiere de a dónde apunta `next`: si el correo llevaba a
    // /reset-password, es el flujo de recuperación de contraseña.
    isRecovery = next === '/reset-password'
  }
  // Si vino `token_hash` con un `type` fuera de la lista permitida (o
  // sin `type`), no se llama a `verifyOtp` -- `verified` queda en false
  // y cae directo al enlace inválido, igual que cualquier otro fallo.

  if (verified && userId && isRecovery) {
    await setRecoveryCookie(userId)
  }

  if (verified) {
    return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('El enlace no es válido o expiró.'), origin)
  )
}
