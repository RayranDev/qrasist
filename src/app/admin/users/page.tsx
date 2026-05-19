import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase/adminClient'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import AdminUserList from './AdminUserList'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener perfiles
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')

  // Obtener datos de autenticación (emails, last_sign_in)
  const { data: authData } = await supabaseAdmin.auth.admin.listUsers()

  // Combinar datos
  const mergedUsers = profiles?.map(profile => {
    const authUser = authData?.users.find(u => u.id === profile.id)
    return {
      ...profile,
      email: authUser?.email || 'Sin correo',
      last_sign_in_at: authUser?.last_sign_in_at || null
    }
  }).sort((a, b) => a.role.localeCompare(b.role)) || []

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestión de Usuarios</h1>
            <p className="text-gray-500 mt-1">Administra los roles, perfiles y contraseñas</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/admin/subjects" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              Ver Materias
            </Link>
            <form action="/auth/signout" method="post">
              <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                Cerrar Sesión
              </button>
            </form>
          </div>
        </header>

        <AdminUserList initialUsers={mergedUsers} currentUser={user} />
      </div>
    </div>
  )
}
