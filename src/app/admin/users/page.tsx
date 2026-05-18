import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import RoleSelect from './RoleSelect'
import { CreateUserForm, ActionButtons } from './UserComponents'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .order('role', { ascending: true })

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

        <CreateUserForm />

        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50/80 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Nombre</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">ID del Sistema</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rol Actual</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles?.map((profile: any) => (
                <tr key={profile.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{profile.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">
                    {profile.id}
                  </td>
                  <td className="px-6 py-4">
                    <RoleSelect userId={profile.id} currentRole={profile.role} />
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end items-center gap-4">
                      <span className="text-xs text-emerald-600 font-bold flex items-center gap-1.5 bg-emerald-50 px-2.5 py-1 rounded-md">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 block"></span> Activo
                      </span>
                      {user.id !== profile.id && <ActionButtons userId={profile.id} currentName={profile.name} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
