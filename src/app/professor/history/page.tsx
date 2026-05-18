import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

export default async function ProfessorHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos todas las sesiones de las materias de este profesor, y contamos sus asistencias
  const { data: sessions } = await supabase
    .from('sessions')
    .select(`
      id,
      date,
      duration_minutes,
      subject:subjects!inner (
        name,
        code,
        professor_id
      ),
      attendances (
        id,
        student:profiles (
          name
        )
      )
    `)
    .eq('subject.professor_id', user.id)
    .order('date', { ascending: false })

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-8">
          <div>
            <Link href="/professor/subjects" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm flex items-center gap-1 mb-2">
              ← Volver a Mis Materias
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Historial de Clases</h1>
            <p className="text-gray-500 mt-1">Revisa la asistencia de tus sesiones anteriores</p>
          </div>
        </header>

        <div className="space-y-6">
          {sessions && sessions.length > 0 ? (
            sessions.map((session: any) => (
              <div key={session.id} className="bg-white p-6 border border-gray-100 rounded-2xl shadow-sm">
                <div className="flex justify-between items-start mb-4 pb-4 border-b border-gray-50">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{session.subject?.name}</h3>
                    <p className="text-sm text-indigo-600 font-medium">{session.subject?.code}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-900 font-medium">
                      {format(new Date(session.date), "EEEE d 'de' MMMM", { locale: es })}
                    </p>
                    <p className="text-xs text-gray-500">{session.duration_minutes} minutos</p>
                  </div>
                </div>
                
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-3">
                    Estudiantes Asistentes ({session.attendances?.length || 0}):
                  </p>
                  {session.attendances && session.attendances.length > 0 ? (
                    <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                      {session.attendances.map((att: any) => (
                        <li key={att.id} className="text-sm text-gray-600 bg-gray-50 px-3 py-2 rounded-lg flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                           {att.student?.name}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Nadie registró asistencia en esta clase.</p>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white p-12 text-center rounded-2xl border border-gray-100">
              <p className="text-gray-500">Aún no has generado ninguna sesión de clase.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
