'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { normalizeName } from '@/lib/utils/normalizeText'

export async function updateOwnProfile(data: {
  first_name?: string
  last_name?: string
  current_password?: string
  password?: string
}) {
  const supabase = await createClient()
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, error: 'No autenticado.' }

  if (data.first_name || data.last_name) {
    const updates: Record<string, string> = {}
    if (data.first_name) updates.first_name = normalizeName(data.first_name)
    if (data.last_name) updates.last_name = normalizeName(data.last_name)

    const { error } = await supabase.from('profiles').update(updates).eq('id', user.id)
    if (error) return { success: false, error: 'Error al actualizar el nombre.' }
    await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      user_metadata: updates,
    })
  }

  if (data.password) {
    if (data.password.length < 6)
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' }
    if (!data.current_password) {
      return { success: false, error: 'Ingresá tu contraseña actual para poder cambiarla.' }
    }

    // Re-autenticacion: probar la contraseña actual con un cliente
    // aparte antes de tocar nada. Cambiar la propia contraseña solo
    // por tener una sesion abierta (ej. equipo compartido, sesion sin
    // bloquear) no debe alcanzar -- hay que demostrar que se conoce
    // la contraseña vigente, igual que pediria cualquier cuenta seria.
    if (!user.email) {
      return { success: false, error: 'No se pudo verificar tu contraseña actual.' }
    }
    const verifyClient = getSupabaseAdmin()
    const { error: verifyError } = await verifyClient.auth.signInWithPassword({
      email: user.email,
      password: data.current_password,
    })
    if (verifyError) {
      return { success: false, error: 'La contraseña actual no es correcta.' }
    }

    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(user.id, {
      password: data.password,
    })
    if (error) return { success: false, error: 'Error al actualizar la contraseña.' }

    // No revalidar la ruta actual aca: Supabase ya invalido la sesion
    // de este mismo navegador al cambiar la contrasena, y una
    // revalidacion dispararia una renavegacion automatica de Next.js
    // que detecta la sesion muerta y redirige a /login (sin mensaje)
    // ANTES de que el cierre de sesion explicado (del lado del
    // cliente) llegue a ejecutarse. El componente que llama a esto
    // es responsable de cerrar sesion el mismo, con su propio aviso.
    return { success: true }
  }

  revalidatePath('/professor/subjects')
  return { success: true }
}
