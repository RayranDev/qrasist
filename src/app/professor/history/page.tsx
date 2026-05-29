import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import HistoryDrillDown from './HistoryDrillDown'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function ProfessorHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos jerarquía completa: Materias (todas) -> Sesiones (todas) -> Asistencias
  // Incluimos inactivos para mantener historial completo; la UI los diferencia
  const { data: subjects } = await supabase
    .from('subjects')
    .select(`
      id,
      name,
      code,
      is_active,
      enrollments (
        student_id
      ),
      sessions (
        id,
        date,
        duration_minutes,
        is_active,
        attendances (
          id,
          scanned_at,
          student_id,
          student:profiles (
            name,
            student_code
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
    <div className="min-h-screen bg-[#F7F7F5]">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <Link href="/professor/subjects" className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1 mb-2">
              ← Volver a Mis Materias
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Historial Consolidado</h1>
            <p className="text-gray-500 mt-1">Explora la asistencia de tus materias, clases y estudiantes</p>
          </div>
        </header>

        <HistoryDrillDown subjects={subjects || []} />
      </div>
      </div>
    </div>
  )
}
