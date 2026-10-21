'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, ChevronDown } from 'lucide-react'
import ReasonModal from '@/components/attendance/ReasonModal'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/toast/ToastProvider'
import { justifyClassOmission } from '@/lib/actions/classOmissions'
import { formatBlockTime } from '@/lib/attendance/classOmissions'
import { formatCivilDate } from '@/lib/utils/civilDate'

export interface OmissionRow {
  date: string
  startTime: string
  endTime: string
  justified: boolean
  reason?: string
}

/**
 * RF22: clases programadas de la materia que no tienen ninguna sesión. El
 * profesor justifica cada una con un motivo obligatorio dirigido a
 * coordinación; las ya justificadas quedan visibles como "Justificada".
 */
export default function ClassOmissionsPanel({
  subjectId,
  omissions,
}: {
  subjectId: string
  omissions: OmissionRow[]
}) {
  const router = useRouter()
  const showToast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [justifying, setJustifying] = useState<OmissionRow | null>(null)
  const [loading, setLoading] = useState(false)

  if (omissions.length === 0) return null

  const pending = omissions.filter((o) => !o.justified)
  // Sin justificar primero, después las justificadas.
  const sorted = [...pending, ...omissions.filter((o) => o.justified)]

  const handleJustify = async (reason: string) => {
    if (!justifying) return
    setLoading(true)
    const res = await justifyClassOmission({ subjectId, date: justifying.date, reason })
    setLoading(false)
    if (res.success) {
      showToast('Justificación enviada a coordinación.', 'success')
      setJustifying(null)
      router.refresh()
    } else {
      showToast(res.error || 'No se pudo guardar la justificación.', 'error')
    }
  }

  const summary =
    pending.length > 0
      ? `${pending.length} ${pending.length === 1 ? 'clase sin registrar' : 'clases sin registrar'}`
      : `${omissions.length} ${omissions.length === 1 ? 'clase justificada' : 'clases justificadas'}`

  return (
    <div
      className={`rounded-xl border ${
        pending.length > 0 ? 'border-amber-200/80 bg-amber-50/40' : 'border-gray-200 bg-gray-50/60'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 rounded-xl"
      >
        <span
          className={`flex items-center gap-2 text-xs font-bold ${
            pending.length > 0 ? 'text-amber-800' : 'text-gray-600'
          }`}
        >
          <CalendarClock className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
          {summary}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-gray-500 mb-2 leading-relaxed">
            Había clase en tu horario y no se registró asistencia. Justifica el motivo para
            coordinación o pídele que registre o suspenda la clase.
          </p>
          <ul className="max-h-56 overflow-y-auto divide-y divide-amber-100/80">
            {sorted.map((omission) => (
              <li key={omission.date} className="py-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 capitalize">
                    {formatCivilDate(omission.date)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {formatBlockTime(omission.startTime)} – {formatBlockTime(omission.endTime)}
                  </p>
                  {omission.justified && omission.reason && (
                    <p className="text-[11px] text-gray-600 mt-1 wrap-break-word">
                      {omission.reason}
                    </p>
                  )}
                </div>
                {omission.justified ? (
                  <Badge variant="success" size="sm">
                    Justificada
                  </Badge>
                ) : (
                  <button
                    type="button"
                    onClick={() => setJustifying(omission)}
                    className="shrink-0 px-3 py-1.5 text-xs font-bold text-amber-800 bg-white border border-amber-200 rounded-lg hover:bg-amber-50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                  >
                    Justificar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {justifying && (
        <ReasonModal
          title="Justificar clase no registrada"
          description={`${formatCivilDate(justifying.date)}, ${formatBlockTime(
            justifying.startTime
          )} – ${formatBlockTime(justifying.endTime)}. Tu motivo queda registrado y llega a coordinación.`}
          confirmLabel="Enviar justificación"
          placeholder="Ej. Cita médica urgente, avisé a coordinación"
          loading={loading}
          onCancel={() => setJustifying(null)}
          onConfirm={handleJustify}
        />
      )}
    </div>
  )
}
