'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export default function HistoryDrillDown({ subjects }: { subjects: any[] }) {
  const [selectedSubject, setSelectedSubject] = useState<any | null>(null)
  const [selectedSession, setSelectedSession] = useState<any | null>(null)

  // Nivel 3: Detalle de Asistencia de una Sesión específica
  if (selectedSession) {
    const enrolledIds = new Set(selectedSubject.enrollments?.map((e: any) => e.student_id) || [])
    const enrolledAttendances = selectedSession.attendances?.filter((a: any) => enrolledIds.has(a.student_id)) || []
    const guestAttendances = selectedSession.attendances?.filter((a: any) => !enrolledIds.has(a.student_id)) || []

    const exportToCSV = () => {
      const rows = [
        ['Nombre Completo', 'Codigo Estudiantil', 'Fecha de Registro', 'Hora Exacta', 'Tipo de Asistente']
      ]
      enrolledAttendances.forEach((a: any) => {
        const d = new Date(a.scanned_at)
        rows.push([a.student?.name || 'Desconocido', a.student?.student_code || 'N/A', format(d, 'dd/MM/yyyy'), format(d, 'hh:mm a'), 'Regular'])
      })
      guestAttendances.forEach((a: any) => {
        const d = new Date(a.scanned_at)
        rows.push([a.student?.name || 'Desconocido', a.student?.student_code || 'N/A', format(d, 'dd/MM/yyyy'), format(d, 'hh:mm a'), 'Invitado'])
      })
      const csvContent = "data:text/csv;charset=utf-8," + rows.map(e => e.join(",")).join("\n")
      const encodedUri = encodeURI(csvContent)
      const link = document.createElement("a")
      link.setAttribute("href", encodedUri)
      link.setAttribute("download", `asistencia_${selectedSubject.code}_${format(new Date(selectedSession.date), 'dd-MM-yyyy')}.csv`)
      document.body.appendChild(link)
      link.click()
    }

    const renderTable = (attendances: any[], emptyMessage: string) => (
      <div className="overflow-x-auto rounded-2xl border border-gray-100 mb-8">
        <table className="w-full text-left text-sm min-w-[600px]">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Estudiante</th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Código</th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Fecha</th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-right">Hora</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {attendances && attendances.length > 0 ? (
              attendances.map((att: any) => {
                const dateObj = new Date(att.scanned_at)
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
                      {format(dateObj, "dd/MM/yyyy")}
                    </td>
                    <td className="px-6 py-4 text-gray-600 font-mono text-right">
                      {format(dateObj, "hh:mm a")}
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">{emptyMessage}</td>
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
            <button onClick={() => setSelectedSession(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1">
              ← Volver
            </button>
            <div className="pl-4 border-l-2 border-gray-100">
              <h3 className="text-xl font-bold text-gray-900">
                Clase del {format(new Date(selectedSession.date), "EEEE d 'de' MMMM", { locale: es })}
              </h3>
              <p className="text-sm text-emerald-600 font-semibold">{selectedSubject?.name}</p>
            </div>
          </div>
          <button 
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-sm rounded-xl transition"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
            Exportar CSV
          </button>
        </div>

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center text-xs">{enrolledAttendances.length}</span>
          Estudiantes Regulares (Inscritos)
        </h4>
        {renderTable(enrolledAttendances, "Ningún estudiante inscrito registró asistencia.")}

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center text-xs">{guestAttendances.length}</span>
          Invitados (No Inscritos)
        </h4>
        {renderTable(guestAttendances, "No hubo invitados en esta clase.")}
      </div>
    )
  }

  // Nivel 2: Listado de Fechas (Sesiones) de una Materia
  if (selectedSubject) {
    const activeSessions = selectedSubject.sessions?.filter((s: any) => s.is_active !== false) || []
    const archivedSessions = selectedSubject.sessions?.filter((s: any) => s.is_active === false) || []

    const SessionCard = ({ session, archived }: { session: any, archived: boolean }) => {
      const [actionLoading, setActionLoading] = useState(false)
      const [showConfirm, setShowConfirm] = useState(false)

      const handleArchive = async () => {
        setActionLoading(true)
        const { deleteSession } = await import('@/lib/actions/professorHistory')
        const res = await deleteSession(session.id)
        if (res.success) { window.location.reload() } else { alert(res.error) }
        setActionLoading(false)
        setShowConfirm(false)
      }

      const handleReactivate = async (e: React.MouseEvent) => {
        e.stopPropagation()
        setActionLoading(true)
        const { reactivateSession } = await import('@/lib/actions/professorHistory')
        const res = await reactivateSession(session.id)
        if (res.success) { window.location.reload() } else { alert(res.error) }
        setActionLoading(false)
      }

      return (
        <>
          {showConfirm && (
            <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
              <div className="bg-white p-6 rounded-2xl shadow-xl max-w-sm w-full animate-in zoom-in-95 duration-200">
                <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
                  <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-gray-900 text-center mb-2">Archivar sesión</h3>
                <p className="text-sm text-gray-500 text-center mb-5">
                  La sesión quedará archivada. Las asistencias registradas se conservan y podrás reactivarla después.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setShowConfirm(false)} disabled={actionLoading} className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition">
                    Cancelar
                  </button>
                  <button onClick={handleArchive} disabled={actionLoading} className="flex-1 py-2.5 bg-amber-500 text-white rounded-xl text-sm font-bold hover:bg-amber-600 transition">
                    {actionLoading ? 'Archivando...' : 'Archivar'}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className={`p-5 border-2 rounded-2xl transition flex justify-between items-center group relative ${
            archived
              ? 'border-dashed border-amber-200 bg-amber-50/30 opacity-70'
              : 'border-gray-50 bg-gray-50/50 hover:border-emerald-300 hover:bg-white'
          }`}>
            <div className={`flex-1 ${!archived ? 'cursor-pointer' : ''}`} onClick={() => !archived && setSelectedSession(session)}>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className={`font-bold capitalize ${archived ? 'text-gray-500' : 'text-gray-900 group-hover:text-emerald-600 transition'}`}>
                  {format(new Date(session.date), "EEEE d 'de' MMMM", { locale: es })}
                </h4>
                {archived && <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Archivada</span>}
              </div>
              <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                {session.attendances?.length || 0} estudiantes
              </p>
            </div>
            <div className="flex items-center gap-2">
              {archived ? (
                <button onClick={handleReactivate} disabled={actionLoading} className="px-3 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50">
                  {actionLoading ? '...' : 'Reactivar'}
                </button>
              ) : (
                <>
                  <button
                    onClick={e => { e.stopPropagation(); setShowConfirm(true) }}
                    disabled={actionLoading}
                    className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition"
                    title="Archivar sesión"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                  </button>
                  <div className="text-gray-300 group-hover:text-emerald-600 transition cursor-pointer" onClick={() => setSelectedSession(session)}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
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
          <button onClick={() => setSelectedSubject(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1">
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
          <p className="text-gray-500 italic p-4 text-center bg-gray-50 rounded-2xl">Esta materia aún no tiene clases registradas.</p>
        ) : (
          <>
            {activeSessions.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {activeSessions.map((session: any) => (
                  <SessionCard key={session.id} session={session} archived={false} />
                ))}
              </div>
            )}
            {archivedSessions.length > 0 && (
              <>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Archivadas</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {archivedSessions.map((session: any) => (
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
        subjects.map(subject => {
          const subActive = subject.is_active !== false
          const sessionCount = subject.sessions?.length || 0
          const activeSessionCount = subject.sessions?.filter((s: any) => s.is_active !== false).length || 0
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
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${subActive ? 'bg-emerald-50 text-emerald-600 group-hover:scale-110 transition-transform' : 'bg-amber-50 text-amber-500'}`}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                  </div>
                  {!subActive && (
                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">Archivada</span>
                  )}
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-1">{subject.name}</h3>
                <p className={`text-sm font-semibold mb-6 ${subActive ? 'text-emerald-600' : 'text-amber-600'}`}>{subject.code}</p>
              </div>

              <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500 font-medium">
                <span>
                  {activeSessionCount} activa(s)
                  {sessionCount > activeSessionCount && ` · ${sessionCount - activeSessionCount} archivada(s)`}
                </span>
                <span className={`opacity-0 group-hover:opacity-100 transition flex items-center gap-1 ${subActive ? 'text-emerald-600' : 'text-amber-500'}`}>
                  Ver clases <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </span>
              </div>
            </div>
          )
        })
      ) : (
        <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-gray-100">
          <p className="text-gray-500 font-medium">Aún no tienes materias asignadas o clases registradas.</p>
        </div>
      )}
    </div>
  )
}
