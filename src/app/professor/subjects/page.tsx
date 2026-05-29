import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SessionButton from './SessionButton'
import Link from 'next/link'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import ProfileModal from './ProfileModal'

export default async function ProfessorSubjectsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', user.id)
    .single()

  const { data: subjects } = await supabase
    .from('subjects')
    .select('*, enrollments(student_id)')
    .eq('professor_id', user.id)

  const firstName = profile?.name?.split(' ')[0] || 'Profe'

  return (
    <div className="min-h-screen bg-[#F7F7F5]">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center mb-8">
            <div>
              <p className="text-sm font-semibold text-emerald-600 mb-0.5">Portal Docente</p>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Hola, {firstName} 👋
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                {subjects?.length === 1 ? '1 materia asignada' : `${subjects?.length ?? 0} materias asignadas`}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <ProfileModal currentName={profile?.name || ''} />
              <Link href="/professor/history" className="px-4 py-2 text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition">
                Historial
              </Link>
              <form action="/auth/signout" method="post">
                <button className="px-4 py-2 text-sm font-bold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                  Cerrar Sesión
                </button>
              </form>
            </div>
          </header>

          {subjects && subjects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {subjects.map((sub) => {
                const studentCount = (sub.enrollments as any[])?.length ?? 0
                return (
                  <div key={sub.id} className="bg-white p-6 border border-gray-100 rounded-2xl shadow-sm hover:shadow-md transition flex flex-col gap-4">
                    <div>
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-lg mb-3 inline-block">
                        {sub.code}
                      </span>
                      <h3 className="text-xl font-bold text-gray-900">{sub.name}</h3>
                      <p className="text-sm text-gray-400 mt-1 flex items-center gap-1.5">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                        </svg>
                        <span className="font-semibold text-gray-600">{studentCount}</span> estudiante{studentCount !== 1 ? 's' : ''} inscritos
                      </p>
                    </div>
                    <SessionButton subjectId={sub.id} />
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4 text-2xl">📚</div>
              <p className="text-gray-500 font-medium">Aún no tienes materias asignadas.</p>
              <p className="text-sm text-gray-400 mt-1">Contacta al administrador para que te asigne materias.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
