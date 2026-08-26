import type { SupabaseClient } from '@supabase/supabase-js'

export async function checkAdmin(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
  return data?.role === 'ADMIN'
}
