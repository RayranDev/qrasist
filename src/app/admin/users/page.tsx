import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Obtener todos los perfiles de la base de datos
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
            <p className="text-gray-500 mt-1">Administra los roles y perfiles del sistema</p>
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-4 text-sm font-medium text-gray-500">Nombre</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-500">ID del Sistema</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-500">Rol Actual</th>
                <th className="px-6 py-4 text-sm font-medium text-gray-500 text-right">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {profiles?.map((profile: any) => (
                <tr key={profile.id} className="hover:bg-gray-50/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{profile.name}</div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 font-mono text-xs">
                    {profile.id}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 text-xs font-semibold rounded-md ${
                      profile.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                      profile.role === 'PROFESSOR' ? 'bg-amber-100 text-amber-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {profile.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="text-sm text-emerald-600 font-medium">Activo</span>
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
