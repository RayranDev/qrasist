'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/toast/ToastProvider'
import { createPastSession } from '@/lib/actions/adminAttendance'
import { MAX_PAST_SESSION_NOTE_LENGTH } from '@/lib/sessions/pastSession'

export default function PastClassModal({
  subjectId,
  subjectName,
  careerId,
}: {
  subjectId: string
  subjectName: string
  careerId?: string
}) {
  const router = useRouter()
  const showToast = useToast()
  const [isOpen, setIsOpen] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [modality, setModality] = useState('PRESENCIAL')
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    setIsOpen(false)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const res = await createPastSession({ subjectId, startsAt, modality, note })
    setLoading(false)

    if (!res.success || !res.sessionId) {
      setError(res.error || 'No se pudo registrar la clase.')
      return
    }

    showToast('Clase registrada. Ahora carga la asistencia de la lista en papel.', 'success')
    const qs = new URLSearchParams({ subjectId, sessionId: res.sessionId })
    if (careerId) qs.set('careerId', careerId)
    setIsOpen(false)
    setStartsAt('')
    setNote('')
    router.push(`/admin/attendance?${qs.toString()}`)
    router.refresh()
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        leftIcon={<CalendarPlus className="w-4 h-4" />}
        onClick={() => setIsOpen(true)}
      >
        Registrar clase pasada
      </Button>

      {isOpen && (
        <Modal
          title="Registrar clase pasada"
          description={`${subjectName}. Para cuando la asistencia se tomó en papel por una falla de internet.`}
          onClose={close}
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Fecha y hora de inicio"
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              helperText="Hora de Colombia. La clase debe haber ocurrido ya."
              required
            />

            <Select
              label="Modalidad"
              value={modality}
              onChange={(e) => setModality(e.target.value)}
            >
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
            </Select>

            <div className="space-y-1.5">
              <label
                htmlFor="past-class-note"
                className="block text-xs font-semibold text-gray-700 tracking-wide"
              >
                Nota (opcional)
              </label>
              <textarea
                id="past-class-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, MAX_PAST_SESSION_NOTE_LENGTH))}
                rows={2}
                placeholder="Ej. Lista en papel entregada por el profesor el 12/03"
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none hover:border-gray-300 focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
              />
            </div>

            <p className="text-xs text-gray-500 leading-relaxed">
              La clase se crea cerrada, sin código QR, y cuenta como dictada. Después podrás marcar
              la asistencia de cada estudiante desde la lista.
            </p>

            {error && (
              <p
                role="alert"
                className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"
              >
                {error}
              </p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={close}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={loading}>
                Registrar clase
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
