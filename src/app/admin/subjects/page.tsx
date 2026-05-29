import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreateSubjectForm, SubjectActionButtons } from './SubjectComponents'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function AdminSubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch subjects (todos para mostrar activos e inactivos) y profesores activos
  const { data: subjects } = await supabase
    .from('subjects')
    .select('*, professor:profiles(name)')
    .order('is_active', { ascending: false })
    .order('name')
  const { data: professors } = await supabase
    .from('profiles')
    .select('id, name')
    .eq('role', 'PROFESSOR')
    .eq('is_active', true)

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Panel de Administrador</h1>
            <p className="text-gray-500 mt-1">Gestiona las materias y profesores</p>
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <Link href="/admin/dashboard" className="text-sm font-medium text-gray-500 hover:text-gray-900 transition">
              Dashboard
            </Link>
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

        <CreateSubjectForm professors={professors || []} />

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Materias</h2>
            {subjects?.some(s => s.is_active === false) && (
              <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded-lg">
                {subjects.filter(s => s.is_active === false).length} archivada(s)
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {subjects?.map((sub) => {
              const isActive = sub.is_active !== false
              return (
                <div
                  key={sub.id}
                  className={`p-4 border rounded-xl transition flex flex-col justify-between ${
                    isActive
                      ? 'border-gray-100 hover:border-emerald-100'
                      : 'border-dashed border-amber-200 bg-amber-50/30 opacity-70'
                  }`}
                >
                  <div>
                    <div className="flex justify-between items-start mb-2 relative">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 text-xs font-bold rounded-md ${isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {sub.code}
                        </span>
                        {!isActive && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-amber-100 text-amber-700 rounded-full">
                            Archivada
                          </span>
                        )}
                      </div>
                      <SubjectActionButtons subject={sub} professors={professors || []} />
                    </div>
                    <h3 className="font-bold text-gray-900 mb-1 text-lg">{sub.name}</h3>
                    <p className="text-sm text-gray-500 font-medium mb-4">Prof. {sub.professor?.name || 'Sin asignar'}</p>

                    {isActive && (
                      <Link
                        href={`/admin/subjects/${sub.id}/enrollments`}
                        className="block w-full py-2 bg-gray-50 hover:bg-emerald-50 text-emerald-600 text-center rounded-xl text-sm font-bold transition border border-gray-100 hover:border-emerald-100"
                      >
                        Gestionar Estudiantes
                      </Link>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
