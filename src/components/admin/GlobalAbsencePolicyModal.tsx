'use client'

import { useState } from 'react'
import { Sliders, CheckCircle2, AlertCircle, X, ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { updateGlobalAbsencePolicy } from '@/lib/actions/adminAcademicPolicy'

interface GlobalAbsencePolicyModalProps {
  initialRuleType?: 'PERCENTAGE' | 'FIXED_COUNT'
  initialPercentage?: number
  initialCount?: number
  initialPlannedSessions?: number
  initialLateAfterMinutes?: number | null
  initialLatesPerAbsence?: number | null
  totalSubjectsCount?: number
}

export default function GlobalAbsencePolicyModal({
  initialRuleType = 'PERCENTAGE',
  initialPercentage = 20,
  initialCount = 4,
  initialPlannedSessions = 16,
  initialLateAfterMinutes = 15,
  initialLatesPerAbsence = null,
  totalSubjectsCount = 95,
}: GlobalAbsencePolicyModalProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [ruleType, setRuleType] = useState<'PERCENTAGE' | 'FIXED_COUNT'>(initialRuleType)
  const [percentage, setPercentage] = useState(initialPercentage)
  const [count, setCount] = useState(initialCount)
  const [plannedSessions, setPlannedSessions] = useState(initialPlannedSessions)
  const [lateAfterMinutes, setLateAfterMinutes] = useState<number | string>(
    initialLateAfterMinutes ?? ''
  )
  const [latesPerAbsence, setLatesPerAbsence] = useState<number | string>(
    initialLatesPerAbsence ?? ''
  )
  const [applyToAll, setApplyToAll] = useState(true)
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const res = await updateGlobalAbsencePolicy({
        absenceRuleType: ruleType,
        maxAbsencePercentage: percentage,
        maxAbsenceCount: ruleType === 'FIXED_COUNT' ? count : null,
        totalPlannedSessions: plannedSessions,
        lateAfterMinutes: lateAfterMinutes === '' ? null : Number(lateAfterMinutes),
        latesPerAbsence: latesPerAbsence === '' ? null : Number(latesPerAbsence),
        applyToAllActiveSubjects: applyToAll,
      })

      if (res.success) {
        setFeedback({
          type: 'success',
          message: applyToAll
            ? `Política aplicada exitosamente a ${res.countUpdated ?? totalSubjectsCount} materias.`
            : 'Política institucional guardada.',
        })
        setTimeout(() => {
          setIsOpen(false)
          setFeedback(null)
        }, 1400)
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Error al actualizar la política.',
        })
      }
    } catch {
      setFeedback({
        type: 'error',
        message: 'Ocurrió un error inesperado al conectar con el servidor.',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200/80 hover:bg-neutral-50 hover:border-neutral-300 rounded-lg shadow-2xs transition-all cursor-pointer"
      >
        <Sliders className="w-3.5 h-3.5 text-neutral-500 stroke-[1.75]" />
        <span>Configurar Política</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div
            className="w-full max-w-lg bg-white rounded-2xl border border-neutral-200 shadow-xl overflow-hidden animate-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
          >
            {/* Cabecera */}
            <div className="px-6 py-4 border-b border-neutral-100 flex items-center justify-between bg-neutral-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-neutral-900 text-white flex items-center justify-center">
                  <Sliders className="w-4 h-4 stroke-[1.75]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900">
                    Política Institucional de Asistencias
                  </h3>
                  <p className="text-xs text-neutral-500">
                    Criterio de reprobación y tolerancia de inasistencias
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 p-1.5 rounded-lg hover:bg-neutral-100 transition-colors"
                aria-label="Cerrar modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Formulario */}
            <form onSubmit={handleSave} className="p-6 space-y-5">
              {/* Selector de Tipo de Regla */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-500 mb-2">
                  Tipo de regla de inasistencia
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 bg-neutral-100 rounded-xl border border-neutral-200/60">
                  <button
                    type="button"
                    onClick={() => setRuleType('PERCENTAGE')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      ruleType === 'PERCENTAGE'
                        ? 'bg-white text-neutral-900 shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    Porcentaje (%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setRuleType('FIXED_COUNT')}
                    className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                      ruleType === 'FIXED_COUNT'
                        ? 'bg-white text-neutral-900 shadow-2xs'
                        : 'text-neutral-600 hover:text-neutral-900'
                    }`}
                  >
                    Cantidad fija de fallas
                  </button>
                </div>
              </div>

              {/* Valores según regla */}
              {ruleType === 'PERCENTAGE' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-neutral-800">
                      Máximo de inasistencias permitido
                    </label>
                    <span className="text-xs font-mono font-bold text-neutral-900 px-2 py-0.5 bg-neutral-100 rounded-md">
                      {percentage}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={50}
                    step={1}
                    value={percentage}
                    onChange={(e) => setPercentage(Number(e.target.value))}
                    className="w-full h-2 bg-neutral-200 rounded-lg appearance-none cursor-pointer accent-neutral-900"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1.5">
                    Estándar universitario habitual: 20% (el estudiante reprueba al acumular más del{' '}
                    {percentage}% de inasistencias).
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Número máximo de inasistencias permitidas
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={count}
                    onChange={(e) => setCount(Math.max(1, Number(e.target.value)))}
                    className="w-full px-3 py-2 text-xs font-mono border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                  <p className="text-[11px] text-neutral-500 mt-1">
                    El estudiante entra en estado de reprobación a partir de la falla número{' '}
                    {count + 1}.
                  </p>
                </div>
              )}

              {/* Sesiones planificadas del semestre */}
              <div>
                <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                  Sesiones planificadas en el semestre
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={plannedSessions}
                  onChange={(e) => setPlannedSessions(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  Generalmente 16 semanas para períodos semestrales regulares.
                </p>
              </div>

              {/* Tardanzas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Tolerancia de tardanza (min)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={lateAfterMinutes}
                    onChange={(e) => setLateAfterMinutes(e.target.value)}
                    placeholder="Vacío = sin seguimiento"
                    title="Minutos tras generar el QR a partir de los cuales el escaneo cuenta como tarde. Vacío desactiva el seguimiento de tardanzas."
                    className="w-full px-3 py-2 text-xs font-mono border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-800 mb-1.5">
                    Tardanzas por falta
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={latesPerAbsence}
                    onChange={(e) => setLatesPerAbsence(e.target.value)}
                    placeholder="Ej. 3 (opcional)"
                    title="Cada cuántas tardanzas se suma una inasistencia. Vacío = las tardanzas nunca se convierten en falta."
                    className="w-full px-3 py-2 text-xs font-mono border border-neutral-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>

              {/* Checkbox aplicar en lote */}
              <div className="p-3.5 bg-neutral-50 rounded-xl border border-neutral-200/70 flex items-start gap-3">
                <input
                  id="applyToAllSubjects"
                  type="checkbox"
                  checked={applyToAll}
                  onChange={(e) => setApplyToAll(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-neutral-300 text-neutral-900 focus:ring-neutral-900"
                />
                <label
                  htmlFor="applyToAllSubjects"
                  className="text-xs text-neutral-700 leading-snug cursor-pointer select-none"
                >
                  <span className="font-semibold text-neutral-900 block">
                    Propagar y aplicar a las {totalSubjectsCount} materias activas
                  </span>
                  Actualizará inmediatamente el umbral de inasistencia en todas las materias
                  registradas.
                </label>
              </div>

              {/* Feedback */}
              {feedback && (
                <div
                  className={`p-3 rounded-xl flex items-center gap-2 text-xs font-medium ${
                    feedback.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  )}
                  <span>{feedback.message}</span>
                </div>
              )}

              {/* Botones de acción */}
              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-100">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  isLoading={loading}
                  className="bg-neutral-900 hover:bg-neutral-800 border-neutral-950"
                >
                  Guardar y Aplicar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
