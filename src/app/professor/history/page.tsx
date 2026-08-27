import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import HistoryDrillDown from './HistoryDrillDown'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

export default async function ProfessorHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Obtenemos jerarquía completa: Materias (todas) -> Sesiones (todas) -> Asistencias
  // Incluimos inactivos para mantener historial completo; la UI los diferencia
  const { data: subjects } = await supabase
    .from('subjects')
    .select(
      `
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
          ip_address,
          student:profiles (
            name,
            student_code
          )
        )
      )
    `
    )
    .eq('professor_id', user.id)

  // Ordenamos las sesiones por fecha dentro de cada materia para comodidad
  if (subjects) {
    subjects.forEach((sub) => {
      if (sub.sessions) {
        sub.sessions.sort(
          (a: { date: string }, b: { date: string }) =>
            new Date(b.date).getTime() - new Date(a.date).getTime()
        )
      }
    })
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-center mb-10">
            <div>
              <BackLink href="/professor/subjects">Volver a Mis Materias</BackLink>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Historial Consolidado
              </h1>
              <p className="text-gray-500 mt-1">
                Explora la asistencia de tus materias, clases y estudiantes
              </p>
            </div>
          </header>

          <HistoryDrillDown
            subjects={
              (subjects || []) as unknown as Parameters<typeof HistoryDrillDown>[0]['subjects']
            }
          />
        </div>
      </div>
    </div>
  )
}
