'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useToast } from '@/components/toast/ToastProvider'
import { es } from 'date-fns/locale'
import { Download, Archive, Users, ChevronRight, BookOpen, TriangleAlert } from 'lucide-react'

interface Student {
  name: string
  student_code: string | null
}

interface Attendance {
  id: string
  scanned_at: string
  student_id: string
  ip_address: string | null
  student: Student | null
}

// IP mas frecuente entre las asistencias de una sesion -- no es
// "la IP correcta", es solo la del grupo (normalmente el WiFi del
// salon). Sirve para resaltar un registro que vino de una red
// distinta al resto, que es la senal real de fraude a distancia --
// bloquear por IP compartida haria lo contrario (todo el salon
// comparte esa IP legitimamente).
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
  // Si nadie repite IP (clases muy chicas, cada quien con datos
  // moviles), no hay "grupo" contra el cual comparar -- no marcar nada.
  return bestCount > 1 ? best : null
}

interface Session {
  id: string
  date: string
  duration_minutes: number | null
  is_active: boolean
  attendances: Attendance[]
}

interface Enrollment {
  student_id: string
}

interface Subject {
  id: string
  name: string
  code: string
  is_active: boolean
  enrollments: Enrollment[]
  sessions: Session[]
}

export default function HistoryDrillDown({ subjects }: { subjects: Subject[] }) {
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

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

    const renderTable = (attendances: Attendance[], emptyMessage: string) => (
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
                Fecha
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                Hora
              </th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">
                IP
              </th>
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
                return (
                  <tr key={att.id} className="hover:bg-gray-50/50 transition">
                    <td className="px-6 py-4 font-bold text-gray-900 flex items-center gap-2.5">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full shadow-sm shadow-emerald-200"></div>
                      {att.student?.name}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-xs font-bold">
                      {att.student?.student_code || '---'}
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
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 italic">
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
              <p className="text-sm text-emerald-600 font-semibold">{selectedSubject?.name}</p>
            </div>
          </div>
          <button
            onClick={exportToExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-sm rounded-xl transition"
          >
            <Download className="w-4 h-4" strokeWidth={2} />
            Exportar Excel
          </button>
        </div>

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">
            {enrolledAttendances.length}
          </span>
          Estudiantes Regulares (Inscritos)
        </h4>
        {renderTable(enrolledAttendances, 'Ningún estudiante inscrito registró asistencia.')}

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs">
            {guestAttendances.length}
          </span>
          Invitados (No Inscritos)
        </h4>
        {renderTable(guestAttendances, 'No hubo invitados en esta clase.')}
      </div>
    )
  }

  // Nivel 2: Listado de Fechas (Sesiones) de una Materia
  if (selectedSubject) {
    const activeSessions = selectedSubject.sessions?.filter((s) => s.is_active !== false) || []
    const archivedSessions = selectedSubject.sessions?.filter((s) => s.is_active === false) || []

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
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                  <Archive className="w-6 h-6 text-amber-500" strokeWidth={2} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">
                  Archivar sesión
                </h3>
                <p className="text-sm text-gray-500 text-center mb-5">
                  La sesión quedará archivada. Las asistencias registradas se conservan y podrás
                  reactivarla después.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowConfirm(false)}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleArchive}
                    disabled={actionLoading}
                    className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition"
                  >
                    {actionLoading ? 'Archivando...' : 'Archivar'}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div
            className={`p-5 border-2 rounded-2xl transition flex justify-between items-center group relative ${
              archived
                ? 'border-dashed border-amber-200 bg-amber-50/30 opacity-70'
                : 'border-gray-50 bg-gray-50/50 hover:border-emerald-300 hover:bg-white'
            }`}
          >
            <div
              className={`flex-1 ${!archived ? 'cursor-pointer' : ''}`}
              onClick={() => !archived && setSelectedSession(session)}
            >
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className={`font-bold capitalize ${archived ? 'text-gray-500' : 'text-gray-900 group-hover:text-emerald-600 transition'}`}
                >
                  {format(new Date(session.date), "EEEE d 'de' MMMM", { locale: es })}
                </h4>
                {archived && (
                  <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                    Archivada
                  </span>
                )}
              </div>
              <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                <Users className="w-4 h-4" strokeWidth={2} />
                {session.attendances?.length || 0} estudiantes
              </p>
            </div>
            <div className="flex items-center gap-2">
              {archived ? (
                <button
                  onClick={handleReactivate}
                  disabled={actionLoading}
                  className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
                >
                  {actionLoading ? '...' : 'Reactivar'}
                </button>
              ) : (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowConfirm(true)
                    }}
                    disabled={actionLoading}
                    className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                    title="Archivar sesión"
                  >
                    <Archive className="w-5 h-5" strokeWidth={2} />
                  </button>
                  <div
                    className="text-gray-300 group-hover:text-emerald-600 transition cursor-pointer"
                    onClick={() => setSelectedSession(session)}
                  >
                    <ChevronRight className="w-6 h-6" strokeWidth={2} />
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )
    }

    return (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => setSelectedSubject(null)}
            className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1"
          >
            ← Volver a Materias
          </button>
          <div className="pl-4 border-l-2 border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">{selectedSubject.name}</h3>
            <p className="text-sm text-gray-500">
              {activeSessions.length} sesión(es) activa(s)
              {archivedSessions.length > 0 && ` · ${archivedSessions.length} archivada(s)`}
            </p>
          </div>
        </div>

        {activeSessions.length === 0 && archivedSessions.length === 0 ? (
          <p className="text-gray-500 italic p-4 text-center bg-gray-50 rounded-2xl">
            Esta materia aún no tiene clases registradas.
          </p>
        ) : (
          <>
            {activeSessions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {archivedSessions.map((session) => (
                    <SessionCard key={session.id} session={session} archived={true} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    )
  }

  // Nivel 1: Listado Consolidado de Materias
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {subjects && subjects.length > 0 ? (
        subjects.map((subject) => {
          const subActive = subject.is_active !== false
          const sessionCount = subject.sessions?.length || 0
          const activeSessionCount =
            subject.sessions?.filter((s) => s.is_active !== false).length || 0
          return (
            <div
              key={subject.id}
              onClick={() => setSelectedSubject(subject)}
              className={`p-6 border rounded-3xl shadow-sm transition cursor-pointer group flex flex-col justify-between ${
                subActive
                  ? 'bg-white border-gray-100 hover:shadow-md hover:border-emerald-300'
                  : 'bg-gray-50 border-dashed border-amber-200 opacity-70'
              }`}
            >
              <div>
                <div className="flex items-start justify-between mb-5">
                  <div
                    className={`w-12 h-12 rounded-xl flex items-center justify-center ${subActive ? 'bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform' : 'bg-amber-50 text-amber-500'}`}
                  >
                    <BookOpen className="w-6 h-6" strokeWidth={2} />
                  </div>
                  {!subActive && (
                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      Archivada
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{subject.name}</h3>
                <p
                  className={`text-sm font-semibold mb-6 ${subActive ? 'text-emerald-600' : 'text-amber-600'}`}
                >
                  {subject.code}
                </p>
              </div>

              <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500 font-medium">
                <span>
                  {activeSessionCount} activa(s)
                  {sessionCount > activeSessionCount &&
                    ` · ${sessionCount - activeSessionCount} archivada(s)`}
                </span>
                <span
                  className={`opacity-0 group-hover:opacity-100 transition flex items-center gap-1 ${subActive ? 'text-emerald-600' : 'text-amber-500'}`}
                >
                  Ver clases <ChevronRight className="w-4 h-4" strokeWidth={2} />
                </span>
              </div>
            </div>
          )
        })
      ) : (
        <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-gray-100">
          <p className="text-gray-500 font-medium">
            Aún no tienes materias asignadas o clases registradas.
          </p>
        </div>
      )}
    </div>
  )
}
