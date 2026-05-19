import { createClient } from '@supabase/supabase-js'

// Este cliente especial bypassa RLS y tiene acceso total a Auth.
// NUNCA debe ser expuesto al cliente, solo usarse en Server Actions.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy-key-to-bypass-build-error'
)
