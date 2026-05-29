import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardRedirect() {
  const supabase = await createClient()

  // Verificamos quién está logueado
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos el perfil para saber qué rol tiene y si está activo
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login?error=Perfil+no+encontrado')
  }

  if (profile.is_active === false) {
    await supabase.auth.signOut()
    redirect('/login?error=Tu+cuenta+ha+sido+desactivada.+Contacta+al+administrador.')
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
