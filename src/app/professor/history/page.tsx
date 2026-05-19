import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import HistoryDrillDown from './HistoryDrillDown'

export const dynamic = 'force-dynamic'

export default async function ProfessorHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos jerarquía completa: Materias -> Sesiones -> Asistencias
  const { data: subjects } = await supabase
    .from('subjects')
    .select(`
      id,
      name,
      code,
      enrollments (
        student_id
      ),
      sessions (
        id,
        date,
        duration_minutes,
        attendances (
          id,
          scanned_at,
          student_id,
          student:profiles (
            name
          )
        )
      )
    `)
    .eq('professor_id', user.id)

  // Ordenamos las sesiones por fecha dentro de cada materia para comodidad
  if (subjects) {
    subjects.forEach(sub => {
      if (sub.sessions) {
        sub.sessions.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime())
      }
    })
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <Link href="/professor/subjects" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm flex items-center gap-1 mb-2">
              ← Volver a Mis Materias
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Historial Consolidado</h1>
            <p className="text-gray-500 mt-1">Explora la asistencia de tus materias, clases y estudiantes</p>
          </div>
        </header>

        <HistoryDrillDown subjects={subjects || []} />
      </div>
    </div>
  )
}
