import { createClient } from '@supabase/supabase-js'

// Crear cliente por llamada para que siempre lea process.env en runtime, no en build.
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada en el servidor.')
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}
