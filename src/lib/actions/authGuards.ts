import type { SupabaseClient } from '@supabase/supabase-js'

export async function checkAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'ADMIN'
}

// Defensa en profundidad para acciones sobre solicitudes de inscripcion:
// el admin puede revisar cualquiera, el profesor solo las de sus materias.
export async function checkAdminOrSubjectProfessor(
  supabase: SupabaseClient,
  userId: string,
  subjectId: string
) {
  if (await checkAdmin(supabase, userId)) return true

  const { data } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('professor_id', userId)
    .maybeSingle()

  return !!data
}
