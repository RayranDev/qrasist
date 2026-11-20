'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { updateAppSettings } from '@/lib/actions/appSettings'
import {
  CLASS_MINUTES_RANGE,
  QR_ROTATION_RANGE,
  REGISTRATION_WINDOW_RANGE,
} from '@/lib/settings/appSettings'
import { DEFAULT_ROTATION_SECONDS } from '@/lib/qrRotation'
import {
  DEFAULT_GLOBAL_POLICY,
  LATE_AFTER_RANGE,
  LATES_PER_ABSENCE_RANGE,
  MAX_ABSENCE_COUNT_RANGE,
  MAX_ABSENCE_PERCENTAGE_RANGE,
  MAX_CHANGE_REASON_LENGTH,
  MIN_CHANGE_REASON_LENGTH,
  type AbsenceRuleType,
  type GlobalPolicy,
} from '@/lib/settings/globalPolicy'
import {
  DEFAULT_LATE_AFTER_MINUTES,
  smallestUnreachableLateAfter,
} from '@/lib/attendance/lateTracking'

const textareaClass =
  'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-medium text-gray-900 placeholder:text-gray-400 transition-all duration-150 hover:border-gray-300 focus:outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100 resize-none'

const emptyToNull = (value: string): number | null => (value.trim() === '' ? null : Number(value))

export default function AttendanceSettingsModal({
  initialRegistrationWindowMinutes,
  initialDefaultClassMinutes,
  initialQrRotationSeconds = DEFAULT_ROTATION_SECONDS,
  initialPolicy = DEFAULT_GLOBAL_POLICY,
  inheritingCount = 0,
  customCount = 0,
  customLateAfterMinutes = [],
}: {
  initialRegistrationWindowMinutes: number
  initialDefaultClassMinutes: number
  /** Rotación global del código QR (segundos) que heredan las sesiones nuevas. */
  initialQrRotationSeconds?: number
  /** Política global vigente (app_settings). */
  initialPolicy?: GlobalPolicy
  /** Materias activas que heredan la política global. */
  inheritingCount?: number
  /** Materias activas con política personalizada (no cambian con la global). */
  customCount?: number
  /** Tolerancias de tardanza (min) de las materias con política personalizada; las nulas se omiten. */
  customLateAfterMinutes?: number[]
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [registrationWindow, setRegistrationWindow] = useState(
    String(initialRegistrationWindowMinutes)
  )
  const [classMinutes, setClassMinutes] = useState(String(initialDefaultClassMinutes))
  const [qrRotation, setQrRotation] = useState(String(initialQrRotationSeconds))
  const [trackLates, setTrackLates] = useState(initialPolicy.lateAfterMinutes !== null)
  const [lateAfter, setLateAfter] = useState(
    String(initialPolicy.lateAfterMinutes ?? DEFAULT_LATE_AFTER_MINUTES)
  )
  const [latesPerAbsence, setLatesPerAbsence] = useState(
    initialPolicy.latesPerAbsence === null ? '' : String(initialPolicy.latesPerAbsence)
  )
  const [ruleType, setRuleType] = useState<AbsenceRuleType>(initialPolicy.absenceRuleType)
  const [percentage, setPercentage] = useState(String(initialPolicy.maxAbsencePercentage))
  const [count, setCount] = useState(
    initialPolicy.maxAbsenceCount === null ? '' : String(initialPolicy.maxAbsenceCount)
  )
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const payload = {
    registrationWindowMinutes: Number(registrationWindow),
    defaultClassMinutes: Number(classMinutes),
    qrRotationSeconds: Number(qrRotation),
    lateAfterMinutes: trackLates ? emptyToNull(lateAfter) : null,
    latesPerAbsence: emptyToNull(latesPerAbsence),
    absenceRuleType: ruleType,
    maxAbsencePercentage: Number(percentage),
    // La cantidad fija solo aplica con esa regla; con porcentaje se envía null.
    maxAbsenceCount: ruleType === 'FIXED_COUNT' ? emptyToNull(count) : null,
  }
  const hasChanges =
    payload.registrationWindowMinutes !== initialRegistrationWindowMinutes ||
    payload.defaultClassMinutes !== initialDefaultClassMinutes ||
    payload.qrRotationSeconds !== initialQrRotationSeconds ||
    payload.lateAfterMinutes !== initialPolicy.lateAfterMinutes ||
    payload.latesPerAbsence !== initialPolicy.latesPerAbsence ||
    payload.absenceRuleType !== initialPolicy.absenceRuleType ||
    payload.maxAbsencePercentage !== initialPolicy.maxAbsencePercentage ||
    payload.maxAbsenceCount !== initialPolicy.maxAbsenceCount
  const reasonValid = reason.trim().length >= MIN_CHANGE_REASON_LENGTH
  const saveDisabled = !hasChanges || !reasonValid
  const saveHint = !hasChanges
    ? 'Cambia algún valor para poder guardar.'
    : 'Escribe el motivo del cambio para poder guardar.'

  // Aviso no bloqueante: si la ventana no supera la tolerancia de tardanza (la
  // global del formulario o la de alguna materia personalizada), esos escaneos
  // nunca podrían ser tarde.
  const windowMinutes = Number(registrationWindow)
  const formLateAfter =
    trackLates && Number.isFinite(Number(lateAfter)) && lateAfter.trim() !== ''
      ? Number(lateAfter)
      : null
  const unreachableLateAfter =
    registrationWindow.trim() === '' || !Number.isFinite(windowMinutes)
      ? null
      : smallestUnreachableLateAfter(
          windowMinutes,
          [formLateAfter, ...customLateAfterMinutes],
          // Tolerancias que ni la ventana máxima supera no se pueden arreglar aquí.
          REGISTRATION_WINDOW_RANGE.max
        )

  const close = () => {
    setIsOpen(false)
    setFeedback(null)
  }

  // Al abrir, el formulario arranca desde los valores vigentes y sin motivo: lo
  // escrito antes y no guardado no debe reaparecer ni reutilizarse.
  const open = () => {
    setRegistrationWindow(String(initialRegistrationWindowMinutes))
    setClassMinutes(String(initialDefaultClassMinutes))
    setQrRotation(String(initialQrRotationSeconds))
    setTrackLates(initialPolicy.lateAfterMinutes !== null)
    setLateAfter(String(initialPolicy.lateAfterMinutes ?? DEFAULT_LATE_AFTER_MINUTES))
    setLatesPerAbsence(
      initialPolicy.latesPerAbsence === null ? '' : String(initialPolicy.latesPerAbsence)
    )
    setRuleType(initialPolicy.absenceRuleType)
    setPercentage(String(initialPolicy.maxAbsencePercentage))
    setCount(initialPolicy.maxAbsenceCount === null ? '' : String(initialPolicy.maxAbsenceCount))
    setReason('')
    setFeedback(null)
    setIsOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const res = await updateAppSettings({ ...payload, reason })

      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.changed
            ? `Configuración guardada. Materias que heredan la política: ${res.inheritingCount}. Con política personalizada (sin cambios): ${res.customCount}.`
            : 'No había cambios que guardar.',
        })
        setReason('')
        router.refresh()
      } else {
        setFeedback({ type: 'error', message: res.error || 'No se pudo guardar la configuración.' })
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
        onClick={open}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200/80 hover:bg-neutral-50 hover:border-neutral-300 rounded-lg shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
      >
        <Timer className="w-3.5 h-3.5 text-neutral-500 stroke-[1.75]" />
        <span>Configuración de asistencia</span>
      </button>

      {isOpen && (
        <Modal
          title="Configuración de asistencia"
          description="Tiempos y política que aplican a todas las materias"
          onClose={close}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSave} className="space-y-5">
            <Input
              label="Ventana de registro (minutos)"
              type="number"
              inputMode="numeric"
              min={REGISTRATION_WINDOW_RANGE.min}
              max={REGISTRATION_WINDOW_RANGE.max}
              value={registrationWindow}
              onChange={(e) => setRegistrationWindow(e.target.value)}
              helperText={`Tiempo que tienen los estudiantes para registrarse con el QR desde que el profesor habilita la asistencia. Entre ${REGISTRATION_WINDOW_RANGE.min} y ${REGISTRATION_WINDOW_RANGE.max}. Aplica a las clases que se inicien desde ahora.`}
              required
            />

            <Input
              label="Rotación del código QR (segundos)"
              type="number"
              inputMode="numeric"
              min={QR_ROTATION_RANGE.min}
              max={QR_ROTATION_RANGE.max}
              value={qrRotation}
              onChange={(e) => setQrRotation(e.target.value)}
              helperText={`Cada cuántos segundos cambia el código QR en las clases nuevas (las ya iniciadas conservan el suyo). Un intervalo más largo reduce la carga del servidor; uno más corto hace caducar antes las fotos compartidas. Al escanear se acepta el código actual y el anterior, así que una foto puede seguir valiendo hasta el doble del intervalo (≈${DEFAULT_ROTATION_SECONDS * 2} s con ${DEFAULT_ROTATION_SECONDS} s, ≈${QR_ROTATION_RANGE.max * 2} s con ${QR_ROTATION_RANGE.max} s). Entre ${QR_ROTATION_RANGE.min} y ${QR_ROTATION_RANGE.max}.`}
              required
            />

            <Input
              label="Duración de clase por defecto (minutos)"
              type="number"
              inputMode="numeric"
              min={CLASS_MINUTES_RANGE.min}
              max={CLASS_MINUTES_RANGE.max}
              value={classMinutes}
              onChange={(e) => setClassMinutes(e.target.value)}
              helperText={`Se usa cuando la clase no coincide con un bloque del horario semanal de la materia. Hasta el fin de la clase el profesor puede corregir la asistencia; después solo coordinación. Entre ${CLASS_MINUTES_RANGE.min} y ${CLASS_MINUTES_RANGE.max}.`}
              required
            />

            <fieldset className="space-y-4 pt-4 border-t border-gray-100 min-w-0">
              <legend className="text-sm font-bold text-gray-900 pr-2">
                Política de asistencia
              </legend>
              <p className="text-xs text-gray-500">
                Solo coordinación puede cambiarla. Materias activas que la heredan:{' '}
                {inheritingCount}. Con política personalizada (no cambian): {customCount}.
              </p>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!trackLates}
                    onChange={(e) => setTrackLates(!e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-navy-700 focus:ring-navy-600"
                  />
                  Sin seguimiento de tardanzas
                </label>
                <Input
                  label="Tolerancia de tardanza (minutos)"
                  type="number"
                  inputMode="numeric"
                  min={LATE_AFTER_RANGE.min}
                  max={LATE_AFTER_RANGE.max}
                  value={trackLates ? lateAfter : ''}
                  onChange={(e) => setLateAfter(e.target.value)}
                  disabled={!trackLates}
                  required={trackLates}
                  helperText={`Minutos desde el inicio de la clase a partir de los cuales un escaneo cuenta como tarde. Entre ${LATE_AFTER_RANGE.min} y ${LATE_AFTER_RANGE.max}.`}
                />
              </div>

              <Input
                label="Tardanzas por falta"
                type="number"
                inputMode="numeric"
                min={LATES_PER_ABSENCE_RANGE.min}
                max={LATES_PER_ABSENCE_RANGE.max}
                value={latesPerAbsence}
                onChange={(e) => setLatesPerAbsence(e.target.value)}
                placeholder="Ej. 3 (opcional)"
                helperText="Cada cuántas tardanzas se suma una inasistencia. Vacío: las tardanzas nunca se convierten en falta."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Regla de faltas"
                  value={ruleType}
                  onChange={(e) => setRuleType(e.target.value as AbsenceRuleType)}
                >
                  <option value="PERCENTAGE">Porcentaje de inasistencia</option>
                  <option value="FIXED_COUNT">Cantidad fija de faltas</option>
                </Select>
                {ruleType === 'PERCENTAGE' ? (
                  <Input
                    label="Límite de faltas (%)"
                    type="number"
                    inputMode="numeric"
                    min={MAX_ABSENCE_PERCENTAGE_RANGE.min}
                    max={MAX_ABSENCE_PERCENTAGE_RANGE.max}
                    value={percentage}
                    onChange={(e) => setPercentage(e.target.value)}
                    required
                  />
                ) : (
                  <Input
                    label="Límite de faltas (cantidad)"
                    type="number"
                    inputMode="numeric"
                    min={MAX_ABSENCE_COUNT_RANGE.min}
                    max={MAX_ABSENCE_COUNT_RANGE.max}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    placeholder="Ej. 4"
                    required
                  />
                )}
              </div>
            </fieldset>

            {/* El contenedor del aviso siempre está en el DOM: una región en vivo que
                aparece junto con su contenido no se anuncia de forma fiable. */}
            <div role="status">
              {unreachableLateAfter !== null && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200/70 text-xs text-amber-900 leading-snug">
                  <Info className="w-4 h-4 shrink-0 mt-px text-amber-600" />
                  <p>
                    Con esta ventana, las materias con tolerancia de {unreachableLateAfter} min o
                    más no podrán registrar tardanzas por QR: el registro se cierra a los{' '}
                    {windowMinutes} min. En ellas solo se podrá marcar tarde de forma manual. Puedes
                    guardar igualmente.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="settings-change-reason"
                className="block text-xs font-semibold text-gray-700 tracking-wide"
              >
                Motivo del cambio
              </label>
              <textarea
                id="settings-change-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                required
                aria-describedby="settings-change-reason-hint"
                maxLength={MAX_CHANGE_REASON_LENGTH}
                placeholder="Ej. Acuerdo de la reunión de coordinación del 12 de noviembre"
                className={textareaClass}
              />
              <p id="settings-change-reason-hint" className="text-xs text-gray-500">
                Obligatorio (mínimo {MIN_CHANGE_REASON_LENGTH} caracteres). Queda registrado en la
                auditoría junto con el valor anterior y el nuevo.
              </p>
            </div>

            {feedback && (
              <div
                role={feedback.type === 'error' ? 'alert' : 'status'}
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

            {saveDisabled && (
              <p id="settings-save-hint" className="text-xs text-gray-500 text-right">
                {saveHint}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-neutral-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={close}
                disabled={loading}
              >
                Cerrar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={loading}
                disabled={saveDisabled}
                aria-describedby={saveDisabled ? 'settings-save-hint' : undefined}
              >
                Guardar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
