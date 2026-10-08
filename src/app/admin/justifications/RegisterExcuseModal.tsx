'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { FilePlus2, Paperclip, Search, X } from 'lucide-react'
import Modal from '@/components/Modal'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/toast/ToastProvider'
import { createClient } from '@/lib/supabase/client'
import {
  createExcuseUploadUrl,
  listStudentAbsences,
  registerExcuse,
  searchStudentsForExcuse,
  type StudentAbsenceOption,
  type StudentSearchResult,
} from '@/lib/actions/adminJustifications'
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
} from '@/lib/justifications/eligibility'

const DEFAULT_REASON = 'Excusa médica validada por coordinación.'
const MAX_REASON = 1000
const MIN_REASON = 10
const SEARCH_DEBOUNCE_MS = 300

function formatAbsenceDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso))
}

export default function RegisterExcuseModal() {
  const router = useRouter()
  const showToast = useToast()
  const [isOpen, setIsOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<StudentSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [student, setStudent] = useState<StudentSearchResult | null>(null)

  const [absences, setAbsences] = useState<StudentAbsenceOption[] | null>(null)
  const [loadingAbsences, setLoadingAbsences] = useState(false)
  const [sessionId, setSessionId] = useState('')

  const [reason, setReason] = useState(DEFAULT_REASON)
  const [file, setFile] = useState<File | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const reset = () => {
    setQuery('')
    setResults([])
    setStudent(null)
    setAbsences(null)
    setSessionId('')
    setReason(DEFAULT_REASON)
    setFile(null)
    setFileError(null)
    setError(null)
  }

  const close = () => {
    setIsOpen(false)
    reset()
  }

  // Búsqueda de estudiantes con debounce: una consulta por pausa al escribir,
  // no una por tecla.
  useEffect(() => {
    if (!isOpen || student) return
    const q = query.trim()
    if (q.length < 2) {
      const clear = setTimeout(() => setResults([]), 0)
      return () => clearTimeout(clear)
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      setSearching(true)
      const res = await searchStudentsForExcuse(q)
      if (cancelled) return
      setResults(res.students || [])
      setSearching(false)
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, isOpen, student])

  const selectStudent = async (selected: StudentSearchResult) => {
    setStudent(selected)
    setResults([])
    setSessionId('')
    setAbsences(null)
    setError(null)
    setLoadingAbsences(true)
    const res = await listStudentAbsences(selected.id)
    setLoadingAbsences(false)
    if (!res.success) {
      setError(res.error || 'No se pudieron cargar las inasistencias.')
      return
    }
    setAbsences(res.absences || [])
  }

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

  const trimmedReason = reason.trim()
  const canSubmit =
    !!student && !!sessionId && !!file && !fileError && trimmedReason.length >= MIN_REASON

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!student || !file || !canSubmit) return
    setSubmitting(true)
    setError(null)

    try {
      const upload = await createExcuseUploadUrl({
        studentId: student.id,
        sessionId,
        fileName: file.name,
        contentType: file.type,
        size: file.size,
      })
      if (!upload.success || !upload.token || !upload.path) {
        setError(upload.error || 'No se pudo preparar la subida del adjunto.')
        return
      }

      const { error: uploadError } = await createClient()
        .storage.from('justifications')
        .uploadToSignedUrl(upload.path, upload.token, file, { contentType: file.type })
      if (uploadError) {
        setError('No se pudo subir el adjunto. Intenta de nuevo.')
        return
      }

      const result = await registerExcuse({
        studentId: student.id,
        sessionId,
        reason: trimmedReason,
        attachmentPath: upload.path,
      })
      if (!result.success) {
        setError(result.error || 'No se pudo registrar la excusa.')
        return
      }

      showToast(`Excusa registrada para ${student.name}.`, 'success')
      close()
      router.refresh()
    } catch {
      setError('Ocurrió un error inesperado. Intenta de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        leftIcon={<FilePlus2 className="w-4 h-4" />}
        onClick={() => setIsOpen(true)}
      >
        Registrar excusa
      </Button>

      {isOpen && (
        <Modal
          title="Registrar excusa"
          description="Sube la excusa que validaste y relaciónala con la inasistencia del estudiante. Queda aprobada de inmediato."
          onClose={close}
          maxWidth="max-w-xl"
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* 1. Estudiante */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-700 tracking-wide">1. Estudiante</p>
              {student ? (
                <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border border-navy-200 bg-navy-50/60">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{student.name}</p>
                    <p className="text-xs font-mono text-gray-500">
                      {student.student_code || '---'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStudent(null)
                      setAbsences(null)
                      setSessionId('')
                    }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-white rounded-lg transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                    aria-label="Cambiar estudiante"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <Input
                    aria-label="Buscar estudiante"
                    placeholder="Nombre, código o correo del estudiante"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    leftElement={<Search className="w-4 h-4" />}
                    autoComplete="off"
                  />
                  {searching && <p className="text-xs text-gray-400">Buscando...</p>}
                  {results.length > 0 && (
                    <ul className="rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                      {results.map((r) => (
                        <li key={r.id}>
                          <button
                            type="button"
                            onClick={() => selectStudent(r)}
                            className="w-full text-left px-3.5 py-2.5 hover:bg-gray-50 transition focus-visible:outline-none focus-visible:bg-gray-50"
                          >
                            <span className="block text-sm font-bold text-gray-900">{r.name}</span>
                            <span className="block text-xs font-mono text-gray-500">
                              {r.student_code || '---'}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!searching && query.trim().length >= 2 && results.length === 0 && (
                    <p className="text-xs text-gray-400">Sin resultados para esa búsqueda.</p>
                  )}
                </>
              )}
            </div>

            {/* 2. Inasistencia */}
            {student && (
              <fieldset className="space-y-2">
                <legend className="text-xs font-semibold text-gray-700 tracking-wide mb-2">
                  2. Inasistencia a justificar
                </legend>
                {loadingAbsences ? (
                  <p className="text-xs text-gray-400">Cargando inasistencias...</p>
                ) : absences && absences.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                    Este estudiante no tiene inasistencias sin justificar en sus materias.
                  </p>
                ) : (
                  <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {(absences || []).map((a) => (
                      <label
                        key={a.sessionId}
                        className={`flex items-start gap-3 px-3.5 py-2.5 cursor-pointer transition ${
                          sessionId === a.sessionId ? 'bg-navy-50/70' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="radio"
                          name="absence"
                          value={a.sessionId}
                          checked={sessionId === a.sessionId}
                          onChange={() => setSessionId(a.sessionId)}
                          className="mt-1 text-navy-700 focus:ring-navy-600"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-gray-900">
                            {a.subjectName}{' '}
                            <span className="text-xs font-mono font-medium text-gray-400">
                              {a.subjectCode}
                            </span>
                          </span>
                          <span className="block text-xs text-gray-500 capitalize">
                            {formatAbsenceDate(a.date)}
                          </span>
                        </span>
                        {a.existingStatus && (
                          <Badge variant="neutral" size="sm">
                            {a.existingStatus === 'PENDING'
                              ? 'Ya enviada por el estudiante'
                              : 'Rechazada antes'}
                          </Badge>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
            )}

            {/* 3. Soporte */}
            {student && sessionId && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label
                    htmlFor="excuse-reason"
                    className="block text-xs font-semibold text-gray-700 tracking-wide"
                  >
                    3. Motivo ({MIN_REASON} a {MAX_REASON} caracteres)
                  </label>
                  <textarea
                    id="excuse-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
                    rows={3}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none hover:border-gray-300 focus:border-navy-600 focus:ring-2 focus:ring-navy-100"
                  />
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="excuse-file"
                    className="block text-xs font-semibold text-gray-700 tracking-wide"
                  >
                    Documento de la excusa (PDF/JPG/PNG/WEBP, máx. 5MB)
                  </label>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold text-gray-600 bg-gray-50 border border-dashed border-gray-300 rounded-xl hover:bg-gray-100 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                    {file ? file.name : 'Seleccionar archivo'}
                  </button>
                  <input
                    id="excuse-file"
                    ref={fileInputRef}
                    type="file"
                    accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(',')}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  {fileError && <p className="text-xs text-red-600">{fileError}</p>}
                </div>
              </div>
            )}

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
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={submitting}
                disabled={!canSubmit}
              >
                Registrar excusa
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
