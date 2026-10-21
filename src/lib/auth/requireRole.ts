import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type AppRole = 'ADMIN' | 'PROFESSOR' | 'STUDENT'

interface ProfileGate {
  role?: string | null
  is_active?: boolean | null
}

/**
 * Decide a dónde mandar a quien intenta abrir una pantalla restringida.
 * Devuelve null si puede pasar.
 *
 * Todo rechazo (rol equivocado, cuenta desactivada, perfil inexistente)
 * va a /dashboard: ahí ya se resuelve la home de cada rol y se cierra la
 * sesión de las cuentas desactivadas, sin duplicar esa lógica.
 */
export function resolveRoleRedirect(
  profile: ProfileGate | null | undefined,
  allowed: readonly AppRole[]
): string | null {
  if (!profile || profile.is_active !== true) return '/dashboard'
  if (!allowed.includes(profile.role as AppRole)) return '/dashboard'
  return null
}

/**
 * Guard de página (App Router). Una página del servidor se renderiza aunque
 * su layout rechace al usuario, así que el chequeo de rol va en CADA page,
 * no en un layout. Las políticas RLS siguen siendo la defensa de datos;
 * esto evita mostrar a un rol pantallas que no son suyas.
 *
 * Devuelve el cliente y el usuario ya autenticados para no repetir la
 * consulta en la página.
 */
export async function requireRole(allowed: readonly AppRole[]) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  const target = resolveRoleRedirect(profile, allowed)
  if (target) redirect(target)

  return { supabase, user, role: profile!.role as AppRole }
}
