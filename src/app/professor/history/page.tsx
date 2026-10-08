import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import HistoryDrillDown from './HistoryDrillDown'
import BackLink from '@/components/BackLink'
import { getAppSettings } from '@/lib/settings/appSettings'
import { canProfessorEditSession } from '@/lib/sessions/classWindow'

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
        class_ends_at,
        duration_minutes,
        is_active,
        suspended_at,
        suspension_reason,
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

  // RF21: el profesor solo corrige asistencia mientras la clase está en
  // curso. Se calcula acá (servidor) y se manda como bandera para que la
  // UI oculte las acciones; la regla real la vuelve a aplicar la server
  // action en cada intento.
  const { defaultClassMinutes } = await getAppSettings(supabase)
  const now = new Date()
  const subjectsWithEditFlag = (subjects || []).map((sub) => ({
    ...sub,
    sessions: ((sub.sessions || []) as { date: string; class_ends_at: string | null }[]).map(
      (session) => ({
        ...session,
        can_edit: canProfessorEditSession(session, defaultClassMinutes, now),
      })
    ),
  }))

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
              className="px-4 py-2 text-sm font-bold text-navy-700 bg-navy-50 rounded-xl hover:bg-navy-100 transition"
            >
              Justificaciones
            </Link>
          </header>

          <HistoryDrillDown
            subjects={
              subjectsWithEditFlag as unknown as Parameters<typeof HistoryDrillDown>[0]['subjects']
            }
            initialSubjectId={subjectId}
          />
        </div>
      </div>
    </div>
  )
}
