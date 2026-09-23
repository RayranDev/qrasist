'use client'

import { useEffect, useRef, useState } from 'react'
import { X, Paperclip } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { createClient } from '@/lib/supabase/client'
import { createJustificationUploadUrl, submitJustification } from '@/lib/actions/justifications'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@/lib/justifications/eligibility'
import type { MissedSessionItem } from './missedSessions'

const MIN_REASON = 10
const MAX_REASON = 1000

export default function JustifyModal({
  session,
  onClose,
  onSubmitted,
}: {
  session: MissedSessionItem
  onClose: () => void
  onSubmitted: () => void
}) {
  const [reason, setReason] = useState(session.justification?.reason || '')
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isResubmit = session.justification?.status === 'REJECTED'
  const isValidReason = reason.trim().length >= MIN_REASON && reason.trim().length <= MAX_REASON

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] || null
    setFile(null)
    setFileError(null)
    if (!selected) return

    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(selected.type)) {
      setFileError('Formato no permitido. Usa PDF, JPG, PNG o WEBP.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    if (selected.size > MAX_ATTACHMENT_SIZE_BYTES) {
      setFileError('El archivo no puede superar 5MB.')
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }
    setFile(selected)
  }

  const handleSubmit = async () => {
    if (!isValidReason) return
    setSubmitting(true)
    setError(null)

    try {
      let attachmentPath: string | undefined

      if (file) {
        const uploadInfo = await createJustificationUploadUrl({
          sessionId: session.sessionId,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
        })

        if (!uploadInfo.success || !uploadInfo.signedUrl || !uploadInfo.token || !uploadInfo.path) {
          setError(uploadInfo.error || 'No se pudo preparar la subida del adjunto.')
          setSubmitting(false)
          return
        }

        const supabase = createClient()
        const { error: uploadError } = await supabase.storage
          .from('justifications')
          .uploadToSignedUrl(uploadInfo.path, uploadInfo.token, file, { contentType: file.type })

        if (uploadError) {
          setError('No se pudo subir el adjunto. Intenta de nuevo.')
          setSubmitting(false)
          return
        }

        attachmentPath = uploadInfo.path
      }

      const result = await submitJustification({
        sessionId: session.sessionId,
        reason: reason.trim(),
        attachmentPath,
      })

      if (!result.success) {
        setError(result.error || 'No se pudo enviar la justificación.')
        setSubmitting(false)
        return
      }

      onSubmitted()
    } catch {
      setError('Ocurrió un error inesperado. Intenta de nuevo.')
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="justify-modal-title"
        className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl border border-neutral-200 shadow-xl p-5 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-1">
          <h3 id="justify-modal-title" className="text-sm font-bold text-gray-900">
            {isResubmit ? 'Volver a enviar justificación' : 'Justificar inasistencia'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1 -mr-1 -mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 rounded"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          {session.subjectName} · {new Date(session.date).toLocaleDateString('es-CO')}
        </p>

        {isResubmit && session.justification?.reviewNote && (
          <div className="mb-3 text-xs bg-red-50 border border-red-100 text-red-700 rounded-xl px-3 py-2">
            <span className="font-bold">Motivo del rechazo anterior: </span>
            {session.justification.reviewNote}
          </div>
        )}

        <label
          htmlFor="justify-reason"
          className="block text-xs font-semibold text-gray-700 mb-1.5"
        >
          Motivo (10 a 1000 caracteres)
        </label>
        <textarea
          id="justify-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
          rows={4}
          className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all mb-1"
          placeholder="Ej. Incapacidad médica adjunta, cita en la EPS a la misma hora de la clase..."
        />
        <p className="text-[11px] text-gray-400 text-right mb-3">
          {reason.trim().length}/{MAX_REASON}
        </p>

        <label
          htmlFor="justify-attachment"
          className="block text-xs font-semibold text-gray-700 mb-1.5"
        >
          Adjunto (opcional, PDF/JPG/PNG/WEBP, máx. 5MB)
        </label>
        <div className="mb-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-xl hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
          >
            <Paperclip className="w-3.5 h-3.5" />
            {file ? file.name : 'Seleccionar archivo'}
          </button>
          <input
            id="justify-attachment"
            ref={fileInputRef}
            type="file"
            accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        {fileError && <p className="text-xs text-red-600 mb-2">{fileError}</p>}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mt-2">
            {error}
          </p>
        )}

        <div className="flex gap-3 mt-4">
          <Button type="button" variant="secondary" size="md" className="flex-1" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            size="md"
            className="flex-1"
            isLoading={submitting}
            disabled={!isValidReason || !!fileError}
            onClick={handleSubmit}
          >
            Enviar
          </Button>
        </div>
      </div>
    </div>
  )
}
