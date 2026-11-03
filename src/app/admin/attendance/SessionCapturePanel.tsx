'use client'

import { useState } from 'react'
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import LocalTime from '@/components/LocalTime'
import { IpCell, LocationCell } from '@/components/attendance/CaptureCells'
import { VIRTUAL_NO_CAPTURE_NOTE } from '@/lib/attendance/captureScope'
import { getSessionCaptureData, type SessionCaptureResult } from '@/lib/actions/attendanceCapture'

/**
 * IP y ubicación de una clase para coordinación, con las mismas alertas que ve
 * el profesor en su historial. Los datos se piden a demanda (al abrir el
 * panel), no viajan con la página. Es solo de /admin/attendance: el panel en
 * vivo del profesor, que se proyecta en el aula, nunca los muestra.
 */
function modalityLabel(value: 'PRESENCIAL' | 'VIRTUAL'): string {
  return value === 'VIRTUAL' ? 'Virtual' : 'Presencial'
}

export default function SessionCapturePanel({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SessionCaptureResult | null>(null)

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && !result && !loading) {
      setLoading(true)
      setResult(await getSessionCaptureData(sessionId))
      setLoading(false)
    }
  }

  const rows = result?.success && result.applies ? result.rows : []
  const alertCount = rows.filter((r) => r.capture.ipDiffers || r.capture.farAway).length

  return (
    <div className="w-full bg-white rounded-3xl border border-neutral-200 shadow-xs overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-5 py-4 text-left cursor-pointer hover:bg-gray-50/60 transition"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-navy-50 text-navy-700 flex items-center justify-center shrink-0">
            <MapPin className="w-4.5 h-4.5" strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">IP y ubicación</p>
            <p className="text-xs text-gray-400">
              {result?.success && result.applies && alertCount > 0
                ? `${alertCount} ${alertCount === 1 ? 'alerta' : 'alertas'} en esta clase`
                : 'Datos capturados al registrar la asistencia'}
            </p>
          </div>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-gray-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
        )}
      </button>

      {open && (
        <div className="px-3 pb-4 max-h-105 overflow-y-auto border-t border-gray-100">
          {loading || !result ? (
            <p className="text-xs text-gray-400 text-center py-6">Cargando...</p>
          ) : !result.success ? (
            <p role="alert" className="text-xs text-red-700 text-center py-6">
              {result.error}
            </p>
          ) : !result.applies ? (
            <div role="note" className="text-xs text-gray-600 text-center py-6 space-y-1">
              <p>{VIRTUAL_NO_CAPTURE_NOTE}</p>
              {result.scheduledModality && result.modality && (
                <p className="font-semibold text-amber-700">
                  {modalityLabel(result.modality)} (horario:{' '}
                  {modalityLabel(result.scheduledModality).toLowerCase()})
                </p>
              )}
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              Nadie ha registrado asistencia en esta clase.
            </p>
          ) : (
            <table className="w-full text-left text-xs mt-2">
              <thead>
                <tr className="text-gray-500 uppercase tracking-wider">
                  <th className="px-2 py-2 font-bold">Estudiante</th>
                  <th className="px-2 py-2 font-bold">IP</th>
                  <th className="px-2 py-2 font-bold">Ubicación</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((r) => (
                  <tr key={r.attendanceId}>
                    <td className="px-2 py-2.5">
                      <p className="font-bold text-gray-900">{r.studentName}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <span className="font-mono text-gray-400">{r.studentCode || '---'}</span>
                        <span className="text-gray-400">
                          <LocalTime date={r.scannedAt} variant="time" />
                        </span>
                        {r.isGuest && (
                          <Badge variant="warning" size="sm">
                            Invitado
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-2.5">
                      <IpCell evaluation={r.capture} />
                    </td>
                    <td className="px-2 py-2.5">
                      <LocationCell evaluation={r.capture} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
