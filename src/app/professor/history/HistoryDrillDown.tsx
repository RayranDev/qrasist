'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useToast } from '@/components/toast/ToastProvider'
import { es } from 'date-fns/locale'
import {
  Download,
  Archive,
  Users,
  ChevronRight,
  BookOpen,
  TriangleAlert,
  CheckCircle2,
  FileSpreadsheet,
  CalendarX2,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { computeAttendanceSummary } from '@/lib/utils/attendancePolicy'
import AttendanceRowActions from '@/components/attendance/AttendanceRowActions'

interface EnrolledProfile {
  id: string
  name: string
  student_code: string | null
}

interface Student {
  name: string
  student_code: string | null
}

interface Attendance {
  id: string
  scanned_at: string
  student_id: string
  ip_address: string | null
  latitude: number | null
  longitude: number | null
  status?: 'PRESENT' | 'LATE'
  marked_by?: string | null
  manual_reason?: string | null
  student: Student | null
}

const SUSPICIOUS_DISTANCE_METERS = 300

function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function mostCommonIp(attendances: Attendance[]): string | null {
  const counts = new Map<string, number>()
  for (const a of attendances) {
    if (!a.ip_address || a.ip_address === 'unknown') continue
    counts.set(a.ip_address, (counts.get(a.ip_address) || 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [ip, count] of counts) {
    if (count > bestCount) {
      best = ip
      bestCount = count
    }
  }
  return bestCount > 1 ? best : null
}

interface Session {
  id: string
  date: string
  duration_minutes: number | null
  is_active: boolean
  latitude: number | null
  longitude: number | null
  attendances: Attendance[]
}

interface Enrollment {
  student_id: string
  student?: EnrolledProfile | null
}

interface Subject {
  id: string
  name: string
  code: string
  is_active: boolean
  absence_rule_type?: 'PERCENTAGE' | 'FIXED_COUNT'
  max_absence_percentage?: number
  max_absence_count?: number | null
  total_planned_sessions?: number
  late_after_minutes?: number | null
  lates_per_absence?: number | null
  enrollments: Enrollment[]
  sessions: Session[]
  absence_justifications?: { student_id: string; status: string }[]
}

export default function HistoryDrillDown({
  subjects,
  initialSubjectId,
}: {
  subjects: Subject[]
  /**
   * Materia a preseleccionar al entrar (ej. desde el link "N en riesgo"
   * de /professor/subjects). Cuando viene con valor, también arranca en
   * la pestaña de inasistencias filtrada a solo estudiantes en riesgo.
   */
  initialSubjectId?: string
}) {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(
    () => subjects.find((s) => s.id === initialSubjectId) || null
  )
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [subjectTab, setSubjectTab] = useState<'sessions' | 'absences'>(
    initialSubjectId ? 'absences' : 'sessions'
  )
  const [onlyRiskStudents, setOnlyRiskStudents] = useState(!!initialSubjectId)

  // Nivel 3: Detalle de Asistencia de una Sesión específica
  if (selectedSession) {
    const enrolledIds = new Set(selectedSubject!.enrollments?.map((e) => e.student_id) || [])
    const enrolledAttendances =
      selectedSession.attendances?.filter((a) => enrolledIds.has(a.student_id)) || []
    const guestAttendances =
      selectedSession.attendances?.filter((a) => !enrolledIds.has(a.student_id)) || []

    const exportToExcel = async () => {
      const toRow = (a: Attendance, tipo: 'Regular' | 'Invitado') => {
        const d = new Date(a.scanned_at)
        return {
          nombre: a.student?.name || 'Desconocido',
          codigo: a.student?.student_code || 'N/A',
          fecha: format(d, 'dd/MM/yyyy'),
          hora: format(d, 'hh:mm a'),
          tipo,
          ip: a.ip_address && a.ip_address !== 'unknown' ? a.ip_address : 'N/A',
        }
      }

      const { downloadWorkbook } = await import('@/lib/excel/exportWorkbook')
      await downloadWorkbook(
        `asistencia_${selectedSubject!.code}_${format(new Date(selectedSession.date), 'dd-MM-yyyy')}`,
        [
          {
            name: 'Asistencia',
            columns: [
              { header: 'Nombre Completo', key: 'nombre', width: 30 },
              { header: 'Código Estudiantil', key: 'codigo', width: 20 },
              { header: 'Fecha de Registro', key: 'fecha', width: 16 },
              { header: 'Hora Exacta', key: 'hora', width: 14 },
              { header: 'Tipo de Asistente', key: 'tipo', width: 16 },
              { header: 'IP de Registro', key: 'ip', width: 18 },
            ],
            rows: [
              ...enrolledAttendances.map((a) => toRow(a, 'Regular')),
              ...guestAttendances.map((a) => toRow(a, 'Invitado')),
            ],
          },
        ]
      )
    }

    const groupIp = mostCommonIp(selectedSession.attendances || [])

    // Estudiantes inscritos que todavía no tienen ningún registro en
    // esta sesión puntual -- permite marcarlos manualmente desde el
    // historial, no solo corregir filas existentes.
    const enrolledAttendedIds = new Set(enrolledAttendances.map((a) => a.student_id))
    const notRegisteredStudents = (selectedSubject!.enrollments || [])
      .map((e) => e.student)
      .filter((st): st is EnrolledProfile => !!st && !enrolledAttendedIds.has(st.id))

    const refreshAfterManualAction = () => window.location.reload()

    const renderTable = (
      attendances: Attendance[],
      emptyMessage: string,
      allowManualActions: boolean
    ) => (
      <div className="overflow-x-auto rounded-2xl border border-gray-100 mb-8">
        <table className="w-full text-left text-sm min-w-175">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Estudiante
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Código
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Estado
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Fecha
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Hora
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                IP
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Ubicación
              </th>
              {allowManualActions && (
                <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {attendances && attendances.length > 0 ? (
              attendances.map((att) => {
                const dateObj = new Date(att.scanned_at)
                const isOutlierIp =
                  groupIp !== null &&
                  att.ip_address !== null &&
                  att.ip_address !== 'unknown' &&
                  att.ip_address !== groupIp
                const hasBothCoords =
                  selectedSession.latitude !== null &&
                  selectedSession.longitude !== null &&
                  att.latitude !== null &&
                  att.longitude !== null
                const distance = hasBothCoords
                  ? distanceMeters(
                      selectedSession.latitude as number,
                      selectedSession.longitude as number,
                      att.latitude as number,
                      att.longitude as number
                    )
                  : null
                const isFarAway = distance !== null && distance > SUSPICIOUS_DISTANCE_METERS
                return (
                  <tr key={att.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-2.5">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-sm shadow-emerald-200"></div>
                      {att.student?.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs font-bold">
                      {att.student?.student_code || '---'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={att.status === 'LATE' ? 'warning' : 'success'} size="sm">
                          {att.status === 'LATE' ? 'Tarde' : 'Presente'}
                        </Badge>
                        {att.marked_by && (
                          <Badge variant="info" size="sm">
                            Manual
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-500 font-medium">
                      {format(dateObj, 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono">
                      {format(dateObj, 'hh:mm a')}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs text-gray-500">
                          {att.ip_address && att.ip_address !== 'unknown' ? att.ip_address : '—'}
                        </span>
                        {isOutlierIp && (
                          <span
                            title="Esta IP es distinta a la del resto del grupo en esta clase"
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
                          >
                            <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
                            distinta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {distance !== null ? (
                        isFarAway ? (
                          <span
                            title="La ubicación del estudiante al escanear está lejos de donde el profesor generó el código."
                            className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-md"
                          >
                            <TriangleAlert className="w-3 h-3" strokeWidth={2.5} />
                            {'>'}
                            {SUSPICIOUS_DISTANCE_METERS}m
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">cerca</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    {allowManualActions && (
                      <td className="px-6 py-4">
                        <AttendanceRowActions
                          sessionId={selectedSession.id}
                          studentId={att.student_id}
                          attendanceId={att.id}
                          currentStatus={att.status ?? 'PRESENT'}
                          onChanged={refreshAfterManualAction}
                        />
                      </td>
                    )}
                  </tr>
                )
              })
            ) : (
              <tr>
                <td
                  colSpan={allowManualActions ? 8 : 7}
                  className="px-6 py-8 text-center text-gray-500 italic"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )

    return (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-between items-start md:items-center flex-col md:flex-row gap-4 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedSession(null)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1"
            >
              ← Volver
            </button>
            <div className="pl-4 border-l-2 border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                Clase del{' '}
                {format(new Date(selectedSession.date), "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <p className="text-sm text-navy-700 font-semibold">{selectedSubject?.name}</p>
            </div>
          </div>
          <Button
            onClick={exportToExcel}
            variant="secondary"
            size="sm"
            leftIcon={<Download className="w-4 h-4" />}
          >
            Exportar Sesión (.xlsx)
          </Button>
        </div>

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-navy-50 text-navy-700 flex items-center justify-center text-xs">
            {enrolledAttendances.length}
          </span>
          Estudiantes Regulares (Inscritos)
        </h4>
        {renderTable(enrolledAttendances, 'Ningún estudiante inscrito registró asistencia.', true)}

        {notRegisteredStudents.length > 0 && (
          <>
            <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs">
                {notRegisteredStudents.length}
              </span>
              Inscritos Sin Registro
            </h4>
            <div className="rounded-2xl border border-dashed border-gray-200 divide-y divide-gray-100 mb-8">
              {notRegisteredStudents.map((st) => (
                <div key={st.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-900">{st.name}</p>
                    <p className="text-xs font-mono text-gray-400">{st.student_code || '---'}</p>
                  </div>
                  <AttendanceRowActions
                    sessionId={selectedSession.id}
                    studentId={st.id}
                    attendanceId={null}
                    currentStatus={null}
                    onChanged={refreshAfterManualAction}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
            {guestAttendances.length}
          </span>
          Invitados (No Inscritos)
        </h4>
        {renderTable(guestAttendances, 'No hubo invitados en esta clase.', false)}
      </div>
    )
  }

  // Nivel 2: Detalle de Materia (Sesiones o Matriz de Inasistencias)
  if (selectedSubject) {
    const activeSessions = selectedSubject.sessions?.filter((s) => s.is_active !== false) || []
    const archivedSessions = selectedSubject.sessions?.filter((s) => s.is_active === false) || []

    // Métricas por cada alumno inscrito
    const enrolledStudents = (selectedSubject.enrollments || [])
      .map((e) => e.student)
      .filter((st): st is EnrolledProfile => !!st)

    // Mapa de asistencias (y tardanzas) por estudiante para las sesiones activas de esta materia
    const attendanceCountMap = new Map<string, number>()
    const lateCountMap = new Map<string, number>()
    for (const session of activeSessions) {
      for (const att of session.attendances || []) {
        attendanceCountMap.set(att.student_id, (attendanceCountMap.get(att.student_id) || 0) + 1)
        if (att.status === 'LATE') {
          lateCountMap.set(att.student_id, (lateCountMap.get(att.student_id) || 0) + 1)
        }
      }
    }

    const justifiedCountMap = new Map<string, number>()
    for (const j of selectedSubject.absence_justifications || []) {
      if (j.status !== 'APPROVED') continue
      justifiedCountMap.set(j.student_id, (justifiedCountMap.get(j.student_id) || 0) + 1)
    }

    const studentMetrics = enrolledStudents.map((st) => {
      const attended = attendanceCountMap.get(st.id) || 0
      const lateCount = lateCountMap.get(st.id) || 0
      const justifiedCount = justifiedCountMap.get(st.id) || 0
      const summary = computeAttendanceSummary(
        activeSessions.length,
        attended,
        {
          ruleType: selectedSubject.absence_rule_type,
          maxPercentage: selectedSubject.max_absence_percentage,
          maxCount: selectedSubject.max_absence_count,
          totalPlannedSessions: selectedSubject.total_planned_sessions,
          latesPerAbsence: selectedSubject.lates_per_absence,
        },
        lateCount,
        justifiedCount
      )
      return {
        student: st,
        summary,
      }
    })

    const warningCount = studentMetrics.filter((m) => m.summary.status === 'WARNING').length
    const failedCount = studentMetrics.filter(
      (m) => m.summary.status === 'FAILED_ATTENDANCE'
    ).length
    const normalCount = studentMetrics.filter((m) => m.summary.status === 'NORMAL').length

    const displayedStudents = onlyRiskStudents
      ? studentMetrics.filter((m) => m.summary.status !== 'NORMAL')
      : studentMetrics

    // Exportación consolidada de la materia
    const exportSubjectConsolidated = async () => {
      const { downloadWorkbook } = await import('@/lib/excel/exportWorkbook')

      const summaryRows = studentMetrics.map((sm) => ({
        nombre: sm.student.name,
        codigo: sm.student.student_code || '---',
        clases_dictadas: sm.summary.sessionsHeld,
        asistencias: sm.summary.attendancesCount,
        inasistencias: sm.summary.absencesCount,
        porcentaje: `${sm.summary.absencePercentage}%`,
        max_permitidas: sm.summary.maxAbsencesAllowed,
        faltas_restantes: sm.summary.remainingAbsences,
        estado:
          sm.summary.status === 'FAILED_ATTENDANCE'
            ? 'Reprobado por Inasistencias'
            : sm.summary.status === 'WARNING'
              ? 'En Riesgo de Pérdida'
              : 'Regular',
      }))

      const sessionRows = activeSessions.map((s) => ({
        fecha: format(new Date(s.date), 'dd/MM/yyyy'),
        asistentes: s.attendances?.length || 0,
        duracion: `${s.duration_minutes || 15} min`,
      }))

      await downloadWorkbook(`asistencia_${selectedSubject.code}_consolidado`, [
        {
          name: 'Resumen Inasistencias',
          columns: [
            { header: 'Estudiante', key: 'nombre', width: 30 },
            { header: 'Código', key: 'codigo', width: 16 },
            { header: 'Clases Dictadas', key: 'clases_dictadas', width: 16 },
            { header: 'Asistencias', key: 'asistencias', width: 14 },
            { header: 'Inasistencias', key: 'inasistencias', width: 14 },
            { header: '% Inasistencia', key: 'porcentaje', width: 16 },
            { header: 'Máx Faltas', key: 'max_permitidas', width: 14 },
            { header: 'Faltas Restantes', key: 'faltas_restantes', width: 16 },
            { header: 'Estado Académico', key: 'estado', width: 28 },
          ],
          rows: summaryRows,
        },
        {
          name: 'Sesiones Dictadas',
          columns: [
            { header: 'Fecha', key: 'fecha', width: 16 },
            { header: 'Total Asistentes', key: 'asistentes', width: 20 },
            { header: 'Duración', key: 'duracion', width: 16 },
          ],
          rows: sessionRows,
        },
      ])
    }

    const SessionCard = ({ session, archived }: { session: Session; archived: boolean }) => {
      const [actionLoading, setActionLoading] = useState(false)
      const [showConfirm, setShowConfirm] = useState(false)
      const showToast = useToast()

      const handleArchive = async () => {
        setActionLoading(true)
        const { deleteSession } = await import('@/lib/actions/professorHistory')
        const res = await deleteSession(session.id)
        if (res.success) {
          window.location.reload()
        } else {
          showToast(res.error || 'No se pudo archivar la sesión.', 'error')
        }
        setActionLoading(false)
        setShowConfirm(false)
      }

      const handleReactivate = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setActionLoading(true)
        const { reactivateSession } = await import('@/lib/actions/professorHistory')
        const res = await reactivateSession(session.id)
        if (res.success) {
          window.location.reload()
        } else {
          showToast(res.error || 'No se pudo reactivar la sesión.', 'error')
        }
        setActionLoading(false)
      }

      return (
        <>
          {showConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-150 border border-neutral-200">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4 border border-amber-100">
                  <Archive className="w-6 h-6 text-amber-600" strokeWidth={2} />
                </div>
                <h3 className="text-base font-bold text-gray-900 text-center mb-1">
                  Archivar sesión
                </h3>
                <p className="text-xs text-gray-500 text-center mb-5 leading-relaxed">
                  La sesión quedará archivada. Las asistencias registradas se conservan y podrás
                  reactivarla después.
                </p>
                <div className="flex gap-3">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => setShowConfirm(false)}
                    disabled={actionLoading}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    variant="danger"
                    size="md"
                    onClick={handleArchive}
                    isLoading={actionLoading}
                    className="flex-1"
                  >
                    Archivar
                  </Button>
                </div>
              </div>
            </div>
          )}
          <div
            className={`p-4 rounded-2xl border transition-all flex justify-between items-center group relative ${
              archived
                ? 'border-dashed border-gray-200 bg-gray-50/40 opacity-70'
                : 'border-gray-200/80 bg-white hover:border-navy-300 hover:shadow-xs'
            }`}
          >
            <div
              className={`flex-1 ${!archived ? 'cursor-pointer' : ''}`}
              onClick={() => !archived && setSelectedSession(session)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`font-bold capitalize text-sm ${archived ? 'text-gray-500' : 'text-gray-900 group-hover:text-navy-700 transition'}`}
                >
                  {format(new Date(session.date), "EEEE d 'de' MMMM", { locale: es })}
                </h4>
                {archived && (
                  <Badge variant="neutral" size="sm">
                    Archivada
                  </Badge>
                )}
              </div>
              <p className="text-xs font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-gray-400" strokeWidth={2} />
                {session.attendances?.length || 0} estudiantes
              </p>
            </div>
            <div className="flex items-center gap-2">
              {archived ? (
                <Button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  variant="outline"
                  size="sm"
                >
                  {actionLoading ? '...' : 'Reactivar'}
                </Button>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowConfirm(true)
                    }}
                    disabled={actionLoading}
                    className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-xl transition"
                    title="Archivar sesión"
                  >
                    <Archive className="w-4 h-4" strokeWidth={2} />
                  </button>
                  <div
                    className="text-gray-300 group-hover:text-navy-700 transition cursor-pointer p-1"
                    onClick={() => setSelectedSession(session)}
                  >
                    <ChevronRight className="w-5 h-5" strokeWidth={2} />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )
    }

    return (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-xs border border-gray-200/80 animate-in fade-in zoom-in-95 duration-150">
        {/* Header con título y botón de exportación segmentada */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-gray-100">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSelectedSubject(null)}
              className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition font-medium text-xs flex items-center gap-1"
            >
              ← Volver
            </button>
            <div className="pl-4 border-l-2 border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">{selectedSubject.name}</h3>
              <p className="text-xs text-gray-500 font-mono mt-0.5">
                {selectedSubject.code} · {activeSessions.length} clase(s) dictada(s)
              </p>
            </div>
          </div>

          <Button
            onClick={exportSubjectConsolidated}
            variant="secondary"
            size="sm"
            leftIcon={<FileSpreadsheet className="w-4 h-4 text-navy-700" />}
          >
            Exportar Planilla Completa (.xlsx)
          </Button>
        </div>

        {/* Tarjetas resumen de inasistencia / semáforo de la materia */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="p-4 rounded-2xl bg-gray-50/70 border border-gray-200/60">
            <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
              Inscritos
            </p>
            <p className="text-2xl font-black text-gray-900 mt-1">{enrolledStudents.length}</p>
          </div>
          <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-100">
            <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">
              Regulares
            </p>
            <p className="text-2xl font-black text-emerald-800 mt-1">{normalCount}</p>
          </div>
          <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-100">
            <p className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
              En Riesgo
            </p>
            <p className="text-2xl font-black text-amber-800 mt-1">{warningCount}</p>
          </div>
          <div className="p-4 rounded-2xl bg-red-50/60 border border-red-100">
            <p className="text-[11px] font-bold text-red-700 uppercase tracking-wider">
              Pérdida por Fallas
            </p>
            <p className="text-2xl font-black text-red-800 mt-1">{failedCount}</p>
          </div>
        </div>

        {/* Selector de pestañas: Sesiones vs Resumen de Inasistencias */}
        <div className="flex items-center justify-between border-b border-gray-100 mb-6 gap-4 flex-wrap">
          <div className="flex gap-2">
            <button
              onClick={() => setSubjectTab('sessions')}
              className={`pb-3 px-3 text-xs font-bold transition-all relative ${
                subjectTab === 'sessions'
                  ? 'text-navy-800 border-b-2 border-navy-700'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              Clases y Sesiones ({activeSessions.length})
            </button>
            <button
              onClick={() => setSubjectTab('absences')}
              className={`pb-3 px-3 text-xs font-bold transition-all relative ${
                subjectTab === 'absences'
                  ? 'text-navy-800 border-b-2 border-navy-700'
                  : 'text-gray-400 hover:text-gray-700'
              }`}
            >
              Matriz de Inasistencias ({enrolledStudents.length})
            </button>
          </div>

          {subjectTab === 'absences' && (
            <div className="pb-2">
              <Button
                variant={onlyRiskStudents ? 'danger' : 'outline'}
                size="sm"
                onClick={() => setOnlyRiskStudents(!onlyRiskStudents)}
              >
                {onlyRiskStudents ? 'Viendo: Solo en Riesgo' : 'Filtrar: Solo en Riesgo'}
              </Button>
            </div>
          )}
        </div>

        {/* Tab 1: Clases / Sesiones */}
        {subjectTab === 'sessions' && (
          <div>
            {activeSessions.length === 0 && archivedSessions.length === 0 ? (
              <div className="p-8 bg-gray-50 rounded-2xl">
                <EmptyState
                  icon={<CalendarX2 className="w-5 h-5" />}
                  title="Esta materia aún no tiene clases registradas"
                  description="Iniciá una sesión desde Mis Materias para empezar a tomar asistencia."
                />
              </div>
            ) : (
              <>
                {activeSessions.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                    {activeSessions.map((session) => (
                      <SessionCard key={session.id} session={session} archived={false} />
                    ))}
                  </div>
                )}
                {archivedSessions.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                      Archivadas
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {archivedSessions.map((session) => (
                        <SessionCard key={session.id} session={session} archived={true} />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab 2: Matriz de Inasistencias (Gestión por Excepción) */}
        {subjectTab === 'absences' && (
          <div>
            {displayedStudents.length === 0 ? (
              <div className="p-8 bg-gray-50 rounded-2xl border border-gray-100">
                <EmptyState
                  icon={
                    onlyRiskStudents ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Users className="w-5 h-5" />
                    )
                  }
                  title={
                    onlyRiskStudents
                      ? '¡Excelente! Ningún estudiante está en riesgo de pérdida por inasistencia'
                      : 'No hay estudiantes inscritos en esta materia'
                  }
                />
              </div>
            ) : (
              <>
                {/* Desktop Table */}
                <div className="hidden md:block overflow-x-auto rounded-2xl border border-gray-200/80">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50/80 border-b border-gray-100">
                      <tr>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          Estudiante
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          Código
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          Asistidas
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          Inasistencias
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          % Faltas
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase">
                          Faltas Restantes
                        </th>
                        <th className="px-6 py-3.5 text-xs font-bold text-gray-500 uppercase text-right">
                          Estado
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {displayedStudents.map(({ student, summary }) => (
                        <tr key={student.id} className="hover:bg-gray-50/50 transition">
                          <td className="px-6 py-3.5 font-bold text-gray-900 text-sm">
                            {student.name}
                          </td>
                          <td className="px-6 py-3.5 font-mono text-xs font-bold text-gray-600">
                            {student.student_code || '---'}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-medium text-emerald-700">
                            {summary.attendancesCount} / {summary.sessionsHeld}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-bold text-gray-900">
                            {summary.absencesCount}
                            {summary.justifiedCount > 0 && (
                              <span className="ml-1.5 text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 rounded px-1 py-0.5 align-middle">
                                {summary.justifiedCount} justif.
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-xs font-mono font-bold">
                            {summary.absencePercentage}%
                          </td>
                          <td className="px-6 py-3.5 text-xs text-gray-600 font-medium">
                            {summary.remainingAbsences} permitida(s)
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <Badge
                              variant={
                                summary.status === 'FAILED_ATTENDANCE'
                                  ? 'danger'
                                  : summary.status === 'WARNING'
                                    ? 'warning'
                                    : 'success'
                              }
                              size="sm"
                            >
                              {summary.status === 'FAILED_ATTENDANCE'
                                ? 'Reprobado por Fallas'
                                : summary.status === 'WARNING'
                                  ? 'En Riesgo'
                                  : 'Regular'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards */}
                <div className="block md:hidden space-y-3">
                  {displayedStudents.map(({ student, summary }) => (
                    <div
                      key={student.id}
                      className="p-4 rounded-2xl border border-gray-200/80 bg-white shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="text-sm font-bold text-gray-900">{student.name}</p>
                          <p className="text-xs font-mono text-gray-500">
                            {student.student_code || '---'}
                          </p>
                        </div>
                        <Badge
                          variant={
                            summary.status === 'FAILED_ATTENDANCE'
                              ? 'danger'
                              : summary.status === 'WARNING'
                                ? 'warning'
                                : 'success'
                          }
                          size="sm"
                        >
                          {summary.status === 'FAILED_ATTENDANCE'
                            ? 'Reprobado'
                            : summary.status === 'WARNING'
                              ? 'En Riesgo'
                              : 'Regular'}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100 text-center text-xs">
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">
                            Asistencias
                          </span>
                          <span className="font-bold text-gray-900">
                            {summary.attendancesCount}/{summary.sessionsHeld}
                          </span>
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">
                            Inasistencias
                          </span>
                          <span className="font-bold text-red-700">
                            {summary.absencesCount} ({summary.absencePercentage}%)
                          </span>
                          {summary.justifiedCount > 0 && (
                            <span className="block text-[10px] font-semibold text-blue-700 mt-0.5">
                              {summary.justifiedCount} justificada
                              {summary.justifiedCount > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="bg-gray-50 p-2 rounded-xl">
                          <span className="text-[10px] text-gray-400 block uppercase font-bold">
                            Restantes
                          </span>
                          <span className="font-bold text-gray-700">
                            {summary.remainingAbsences}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  // Nivel 1: Listado Consolidado de Materias del Profesor
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 animate-in fade-in duration-200">
      {subjects && subjects.length > 0 ? (
        subjects.map((subject) => {
          const subActive = subject.is_active !== false
          const activeSessionCount =
            subject.sessions?.filter((s) => s.is_active !== false).length || 0
          const enrolledCount = subject.enrollments?.length || 0

          return (
            <div
              key={subject.id}
              onClick={() => setSelectedSubject(subject)}
              className={`p-5 rounded-2xl border transition-all cursor-pointer group flex flex-col justify-between ${
                subActive
                  ? 'bg-white border-gray-200/80 hover:border-navy-300 hover:shadow-sm'
                  : 'bg-gray-50 border-dashed border-amber-200 opacity-70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-4">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      subActive
                        ? 'bg-emerald-50 text-emerald-600 group-hover:scale-105 transition-transform'
                        : 'bg-amber-50 text-amber-500'
                    }`}
                  >
                    <BookOpen className="w-5 h-5" strokeWidth={2} />
                  </div>
                  {!subActive ? (
                    <Badge variant="warning" size="sm">
                      Archivada
                    </Badge>
                  ) : (
                    <span className="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                      {subject.code}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1 leading-snug">
                  {subject.name}
                </h3>
                <p className="text-xs text-gray-500 mb-4">
                  {enrolledCount}{' '}
                  {enrolledCount === 1 ? 'estudiante inscrito' : 'estudiantes inscritos'}
                </p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500 font-medium">
                <span>
                  {activeSessionCount}{' '}
                  {activeSessionCount === 1 ? 'clase activa' : 'clases activas'}
                </span>
                <span
                  className={`opacity-0 group-hover:opacity-100 transition flex items-center gap-1 font-bold ${
                    subActive ? 'text-navy-800' : 'text-amber-600'
                  }`}
                >
                  Ver reporte <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
                </span>
              </div>
            </div>
          )
        })
      ) : (
        <div className="col-span-full bg-white p-12 rounded-2xl border border-gray-200">
          <EmptyState
            icon={<BookOpen className="w-5 h-5" />}
            title="Aún no tienes materias asignadas o clases registradas"
            description="Cuando tengas materias asignadas y dictes tu primera clase, el reporte va a aparecer acá."
          />
        </div>
      )}
    </div>
  )
}
