import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LocalTime from '@/components/LocalTime'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { History } from 'lucide-react'
import { getStudentSubjectRisks, formatSubjectStatusLine } from '@/lib/attendance/studentSummaries'
import type { AttendanceStatus } from '@/lib/utils/attendancePolicy'

export const dynamic = 'force-dynamic'

interface AttendanceRecord {
  id: string
  scanned_at: string
  status?: 'PRESENT' | 'LATE'
  marked_by?: string | null
  session: {
    id: string
    date: string
    subject: {
      id: string
      name: string
      code: string
    } | null
  } | null
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  NORMAL: 'text-emerald-700',
  WARNING: 'text-amber-700',
  FAILED_ATTENDANCE: 'text-red-700',
}

export default async function StudentHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: attendances }, risks] = await Promise.all([
    supabase
      .from('attendances')
      .select(
        `
        id,
        scanned_at,
        status,
        marked_by,
        session:sessions (
          id,
          date,
          subject:subjects (
            id,
            name,
            code
          )
        )
      `
      )
      .eq('student_id', user.id)
      .order('scanned_at', { ascending: false }),
    getStudentSubjectRisks(supabase, user.id),
  ])

  const records = (attendances || []) as unknown as AttendanceRecord[]

  const recordsBySubject = new Map<string, AttendanceRecord[]>()
  for (const record of records) {
    const subjectId = record.session?.subject?.id
    if (!subjectId) continue
    const list = recordsBySubject.get(subjectId) || []
    list.push(record)
    recordsBySubject.set(subjectId, list)
  }

  // Orden: primero las materias con más urgencia (reprobadas, luego
  // alerta, luego normales), y dentro de cada grupo alfabético -- así
  // lo que necesita atención aparece arriba sin esconder el resto.
  const statusRank: Record<AttendanceStatus, number> = {
    FAILED_ATTENDANCE: 0,
    WARNING: 1,
    NORMAL: 2,
  }
  const orderedSubjects = [...risks].sort((a, b) => {
    const rankDiff = statusRank[a.summary.status] - statusRank[b.summary.status]
    if (rankDiff !== 0) return rankDiff
    return a.subjectName.localeCompare(b.subjectName)
  })

  const totalRecords = records.length

  return (
    <div className="pt-2 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-black text-gray-900">Historial</h1>
        <p className="text-xs text-gray-400 font-medium">
          {totalRecords === 1 ? '1 asistencia' : `${totalRecords} asistencias`}
        </p>
      </div>

      {orderedSubjects.length > 0 ? (
        <div className="flex flex-col gap-5">
          {orderedSubjects.map((risk) => {
            const subjectRecords = recordsBySubject.get(risk.subjectId) || []
            return (
              <div
                key={risk.subjectId}
                className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-gray-50">
                  <p className="text-sm font-bold text-gray-900">{risk.subjectName}</p>
                  <p
                    className={`text-xs font-semibold mt-0.5 ${STATUS_STYLES[risk.summary.status]}`}
                  >
                    {formatSubjectStatusLine(risk.summary)}
                  </p>
                </div>

                {subjectRecords.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {subjectRecords.map((record) => (
                      <div
                        key={record.id}
                        className="px-4 py-3 flex items-center justify-between gap-3"
                      >
                        <p className="text-xs text-gray-400 shrink-0">
                          <LocalTime date={record.scanned_at} />
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {record.marked_by ? (
                            <Badge variant="neutral" size="sm">
                              Manual
                            </Badge>
                          ) : record.status === 'LATE' ? (
                            <Badge variant="warning" size="sm">
                              Tarde
                            </Badge>
                          ) : (
                            <Badge variant="success" size="sm">
                              Presente
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="px-4 py-3 text-xs text-gray-400">
                    Sin asistencias registradas todavía en esta materia.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <EmptyState
          icon={<History className="w-5 h-5" strokeWidth={2} />}
          title="Aún no tenés historial de asistencias"
          description="Cuando te inscribas en una materia y escanees tu primera sesión, va a aparecer acá agrupado por materia."
        />
      )}
    </div>
  )
}
