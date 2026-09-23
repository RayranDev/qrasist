import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { safeRedirectPath } from '@/lib/utils/safeRedirect'
import type { EmailOtpType } from '@supabase/supabase-js'

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
  const type = searchParams.get('type') as EmailOtpType | null
  const code = searchParams.get('code')
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard')

  const supabase = await createClient()
  let verified = false

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    verified = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    verified = !error
  }

  if (verified) {
    return NextResponse.redirect(new URL(next, origin))
  }

  return NextResponse.redirect(
    new URL('/login?error=' + encodeURIComponent('El enlace no es válido o expiró.'), origin)
  )
}
