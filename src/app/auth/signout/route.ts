import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Mensaje opcional a mostrar en /login -- por ejemplo, avisar que
  // se cerró la sesión porque la propia contraseña acaba de cambiar
  // (Supabase invalida la sesión actual al cambiar la contraseña).
  const formData = await request.formData().catch(() => null)
  const message = formData?.get('message')
  if (typeof message === 'string' && message.trim() !== '') {
    redirect('/login?info=' + encodeURIComponent(message))
  }

  redirect('/login')
}
