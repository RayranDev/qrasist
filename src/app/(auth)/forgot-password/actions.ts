'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { checkRateLimit } from '@/lib/utils/rateLimiter'
import { z } from 'zod'

// Mensaje siempre idéntico exista o no la cuenta -- evita que alguien
// use este formulario para enumerar qué correos están registrados.
const GENERIC_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisá tu bandeja de entrada (y la carpeta de spam).'

const emailSchema = z.string().trim().toLowerCase().email()

async function getRequestOrigin(): Promise<string> {
  const headersList = await headers()
  const host = headersList.get('x-forwarded-host') || headersList.get('host')
  const proto = headersList.get('x-forwarded-proto') || 'https'
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
}

export async function requestPasswordReset(formData: FormData) {
  const rawEmail = ((formData.get('email') as string) || '').trim()
  const parsed = emailSchema.safeParse(rawEmail)

  const headersList = await headers()
  const ipAddress = headersList.get('x-forwarded-for') || 'unknown'

  // Límite por IP y por correo (3 cada 15 min): sin esto, este endpoint
  // permitiría bombardear cualquier bandeja con correos de recuperación,
  // o usarse para tantear en qué dominio caen las cuentas.
  const [ipRate, emailRate] = await Promise.all([
    checkRateLimit(`password_reset:ip:${ipAddress}`, {
      maxAttempts: 3,
      windowMs: 15 * 60_000,
    }),
    parsed.success
      ? checkRateLimit(`password_reset:email:${parsed.data}`, {
          maxAttempts: 3,
          windowMs: 15 * 60_000,
        })
      : Promise.resolve({ allowed: true as const }),
  ])

  if (!ipRate.allowed || !emailRate.allowed) {
    redirect(
      '/forgot-password?error=' +
        encodeURIComponent('Demasiadas solicitudes. Esperá unos minutos e intentá de nuevo.')
    )
  }

  if (parsed.success) {
    const origin = await getRequestOrigin()
    const supabase = await createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${origin}/auth/confirm?next=/reset-password`,
    })
    if (error) {
      // Se registra para diagnóstico, pero nunca se muestra al usuario:
      // el mensaje de éxito es siempre el mismo, exista o no la cuenta.
      console.error('[forgot-password] resetPasswordForEmail falló', error)
    }
  }

  redirect('/forgot-password?info=' + encodeURIComponent(GENERIC_MESSAGE))
}
