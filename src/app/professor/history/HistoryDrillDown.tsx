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

    const renderTable = (attendances: any[], emptyMessage: string) => (
      <div className="overflow-hidden rounded-2xl border border-gray-100 mb-8">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50/80">
            <tr>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Nombre del Estudiante</th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs">Fecha de Registro</th>
              <th className="px-6 py-4 font-bold text-gray-500 uppercase tracking-wider text-xs text-right">Hora Exacta</th>
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
                <td colSpan={3} className="px-6 py-8 text-center text-gray-500 italic">{emptyMessage}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    )

    return (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => setSelectedSession(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1">
            ← Volver a Fechas
          </button>
          <div className="pl-4 border-l-2 border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">
              Clase del {format(new Date(selectedSession.date), "EEEE d 'de' MMMM", { locale: es })}
            </h3>
            <p className="text-sm text-indigo-600 font-semibold">{selectedSubject?.name}</p>
          </div>
        </div>

        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center text-xs">{enrolledAttendances.length}</span>
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
    return (
      <div className="bg-white p-6 md:p-8 rounded-3xl shadow-sm border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={() => setSelectedSubject(null)} className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 transition font-medium text-sm flex items-center gap-1">
            ← Volver a Materias
          </button>
          <div className="pl-4 border-l-2 border-gray-100">
            <h3 className="text-xl font-bold text-gray-900">{selectedSubject.name}</h3>
            <p className="text-sm text-gray-500">Sesiones registradas ({selectedSubject.sessions?.length || 0})</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {selectedSubject.sessions && selectedSubject.sessions.length > 0 ? (
            selectedSubject.sessions.map((session: any) => (
              <div 
                key={session.id} 
                className="p-5 border-2 border-gray-50 bg-gray-50/50 rounded-2xl hover:border-indigo-300 hover:bg-white transition flex justify-between items-center group relative"
              >
                <div className="flex-1 cursor-pointer" onClick={() => setSelectedSession(session)}>
                  <h4 className="font-bold text-gray-900 group-hover:text-indigo-600 transition capitalize">
                    {format(new Date(session.date), "EEEE d 'de' MMMM", { locale: es })}
                  </h4>
                  <p className="text-sm font-medium text-gray-500 mt-1 flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    {session.attendances?.length || 0} estudiantes
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={async (e) => {
                      e.stopPropagation();
                      if(confirm('¿Estás seguro de que quieres borrar esta sesión y todas sus asistencias?')) {
                        const { deleteSession } = await import('@/lib/actions/professorHistory');
                        const res = await deleteSession(session.id);
                        if(res.success) {
                          alert('Sesión borrada correctamente. Actualiza la página para ver los cambios.');
                          window.location.reload();
                        } else alert(res.error);
                      }
                    }}
                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" 
                    title="Borrar Sesión"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                  <div className="text-gray-300 group-hover:text-indigo-600 transition cursor-pointer" onClick={() => setSelectedSession(session)}>
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-gray-500 italic p-4 col-span-2 text-center bg-gray-50 rounded-2xl">Esta materia aún no tiene clases registradas.</p>
          )}
        </div>
      </div>
    )
  }

  // Nivel 1: Listado Consolidado de Materias
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
      {subjects && subjects.length > 0 ? (
        subjects.map(subject => (
          <div 
            key={subject.id} 
            onClick={() => setSelectedSubject(subject)}
            className="bg-white p-6 border border-gray-100 rounded-3xl shadow-sm hover:shadow-md hover:border-indigo-300 transition cursor-pointer group flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-5 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-1">{subject.name}</h3>
              <p className="text-sm font-semibold text-indigo-600 mb-6">{subject.code}</p>
            </div>
            
            <div className="pt-4 border-t border-gray-50 flex justify-between items-center text-sm text-gray-500 font-medium">
              <span>{subject.sessions?.length || 0} sesiones</span>
              <span className="text-indigo-600 opacity-0 group-hover:opacity-100 transition flex items-center gap-1">Ver clases <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></span>
            </div>
          </div>
        ))
      ) : (
        <div className="col-span-full bg-white p-12 text-center rounded-3xl border border-gray-100">
          <p className="text-gray-500 font-medium">Aún no tienes materias asignadas o clases registradas.</p>
        </div>
      )}
    </div>
  )
}
