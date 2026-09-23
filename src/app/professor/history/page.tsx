import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import HistoryDrillDown from './HistoryDrillDown'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

export default async function ProfessorHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ subjectId?: string }>
}) {
  const { subjectId } = await searchParams
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
      absence_rule_type,
      max_absence_percentage,
      max_absence_count,
      total_planned_sessions,
      late_after_minutes,
      lates_per_absence,
      enrollments (
        student_id,
        student:profiles (
          id,
          name,
          student_code
        )
      ),
      absence_justifications (
        student_id,
        status
      ),
      sessions (
        id,
        date,
        duration_minutes,
        is_active,
        latitude,
        longitude,
        attendances (
          id,
          scanned_at,
          student_id,
          ip_address,
          latitude,
          longitude,
          status,
          marked_by,
          manual_reason,
          student:profiles!attendances_student_id_fkey (
            name,
            student_code
          )
        )
      )
    `
    )
    .eq('professor_id', user.id)

  const pendingJustificationsTotal = (subjects || []).reduce(
    (total, sub) =>
      total +
      ((sub.absence_justifications as { status: string }[] | null)?.filter(
        (j) => j.status === 'PENDING'
      ).length ?? 0),
    0
  )

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
          <header className="flex justify-between items-center mb-10 flex-wrap gap-4">
            <div>
              <BackLink href="/professor/subjects">Volver a Mis Materias</BackLink>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Historial Consolidado
              </h1>
              <p className="text-gray-500 mt-1">
                Explora la asistencia de tus materias, clases y estudiantes
              </p>
            </div>
            <Link
              href="/professor/justifications"
              className="relative px-4 py-2 text-sm font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition"
            >
              Justificaciones
              {pendingJustificationsTotal > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center text-[10px] font-bold text-white bg-red-600 rounded-full">
                  {pendingJustificationsTotal}
                </span>
              )}
            </Link>
          </header>

          <HistoryDrillDown
            subjects={
              (subjects || []) as unknown as Parameters<typeof HistoryDrillDown>[0]['subjects']
            }
            initialSubjectId={subjectId}
          />
        </div>
      </div>
    </div>
  )
}
