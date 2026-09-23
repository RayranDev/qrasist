import type { SupabaseClient } from '@supabase/supabase-js'

// is_active=true en la query (no solo en el chequeo de role en JS): una
// cuenta desactivada no debe contar como ADMIN aunque conserve ese role
// en la fila -- deleteUserAccount solo hace is_active=false, no invalida
// el JWT, asi que sin este filtro un admin desactivado seguiria pasando
// todos los checkAdmin(...) de la app mientras su sesion siga viva.
export async function checkAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .eq('is_active', true)
    .single()
  return data?.role === 'ADMIN'
}

// Defensa en profundidad para acciones sobre solicitudes de inscripcion:
// el admin puede revisar cualquiera, el profesor solo las de sus materias.
// La rama de profesor tambien exige cuenta activa -- mismo motivo que en
// checkAdmin: la sesion de un profesor desactivado sigue siendo valida.
export async function checkAdminOrSubjectProfessor(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string
) {
  if (await checkAdmin(supabase, userId)) return true

  const { data: caller } = await supabase
    .from('profiles')
    .select('is_active')
    .eq('id', userId)
    .single()
  if (!caller?.is_active) return false

  const { data } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('professor_id', userId)
    .maybeSingle()

  return !!data
}
