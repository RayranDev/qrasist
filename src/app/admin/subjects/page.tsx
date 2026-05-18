import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminSubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch subjects
  const { data: subjects } = await supabase.from('subjects').select('*, professor:profiles(name)')

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Panel de Administrador</h1>
            <p className="text-gray-500 mt-1">Gestiona las materias y profesores</p>
          </div>
          <div className="flex gap-4 items-center">
            <Link href="/admin/users" className="text-sm font-medium text-gray-600 hover:text-gray-900 transition">
              Ver Usuarios
            </Link>
            <form action="/auth/signout" method="post">
              <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                Cerrar Sesión
              </button>
            </form>
          </div>
        </header>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-xl font-semibold mb-4">Materias Activas</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {subjects?.map((sub) => (
            <div key={sub.id} className="p-4 border border-gray-100 rounded-xl hover:border-indigo-100 transition group cursor-pointer">
              <div className="flex justify-between items-start mb-2">
                <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md">
                  {sub.code}
                </span>
              </div>
              <h3 className="font-medium text-gray-900 mb-1">{sub.name}</h3>
              <p className="text-sm text-gray-500">Prof. {sub.professor?.name}</p>
            </div>
          ))}
        </div>
      </div>
      </div>
    </div>
    </div>
  )
}
