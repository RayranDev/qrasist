'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer, CheckCircle2, AlertCircle, Info } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { updateAppSettings } from '@/lib/actions/appSettings'
import { CLASS_MINUTES_RANGE, REGISTRATION_WINDOW_RANGE } from '@/lib/settings/appSettings'

export default function AttendanceSettingsModal({
  initialRegistrationWindowMinutes,
  initialDefaultClassMinutes,
}: {
  initialRegistrationWindowMinutes: number
  initialDefaultClassMinutes: number
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [registrationWindow, setRegistrationWindow] = useState(
    String(initialRegistrationWindowMinutes)
  )
  const [classMinutes, setClassMinutes] = useState(String(initialDefaultClassMinutes))
  const [loading, setLoading] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  )

  const close = () => {
    setIsOpen(false)
    setFeedback(null)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setFeedback(null)

    try {
      const res = await updateAppSettings({
        registrationWindowMinutes: Number(registrationWindow),
        defaultClassMinutes: Number(classMinutes),
      })

      if (res.success) {
        setFeedback({ type: 'success', message: 'Configuración de asistencia guardada.' })
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
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-neutral-700 bg-white border border-neutral-200/80 hover:bg-neutral-50 hover:border-neutral-300 rounded-lg shadow-2xs transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
      >
        <Timer className="w-3.5 h-3.5 text-neutral-500 stroke-[1.75]" />
        <span>Configuración de asistencia</span>
      </button>

      {isOpen && (
        <Modal
          title="Configuración de asistencia"
          description="Tiempos que aplican a todas las materias"
          onClose={close}
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

            <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200/70 text-xs text-amber-900 leading-snug">
              <Info className="w-4 h-4 shrink-0 mt-px text-amber-600" />
              <p>
                Si la tolerancia de tardanza de una materia es igual o mayor que la ventana de
                registro, ningún escaneo por QR contará como tarde: solo se podrá marcar tarde de
                forma manual.
              </p>
            </div>

            {feedback && (
              <div
                role="status"
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
              <Button type="submit" variant="primary" size="sm" isLoading={loading}>
                Guardar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
