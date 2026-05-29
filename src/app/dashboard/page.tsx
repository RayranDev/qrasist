import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardRedirect() {
  const supabase = await createClient()

  // Verificamos quién está logueado
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos el perfil para saber qué rol tiene
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) {
    // Si no tiene perfil, lo mandamos a una vista genérica o cerramos sesión
    redirect('/login?error=Perfil+no+encontrado')
  }

  // Redirigimos según el rol
  switch (profile.role) {
    case 'ADMIN':
      redirect('/admin/dashboard')
    case 'PROFESSOR':
      redirect('/professor/subjects')
    case 'STUDENT':
    default:
      redirect('/student/scanner')
  }
}
