'use client'

import { useEffect, useMemo, useState } from 'react'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/toast/ToastProvider'
import {
  downloadReport,
  isSessionExpired,
  SESSION_EXPIRED_MESSAGE,
} from '@/lib/reports/downloadReport'

/** Espera antes de pedir los indicadores: cambiar varios filtros seguidos dispara una sola consulta. */
const SUMMARY_DEBOUNCE_MS = 400

interface PeriodOption {
  id: string
  name: string
}

interface CutOption {
  id: string
  name: string
}

interface SubjectOption {
  id: string
  name: string
  code: string
  periodId: string | null
  professorId: string | null
}

interface ProfessorOption {
  id: string
  name: string
}

interface Summary {
  scopeLabel: string
  totals: {
    subjects: number
    students: number
    sessionsHeld: number
    overallAttendancePct: number | null
    atRiskStudents: number
    failedStudents: number
    complianceOverallPct: number | null
  }
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'NORMAL', label: 'Normal' },
  { value: 'WARNING', label: 'En riesgo' },
  { value: 'FAILED_ATTENDANCE', label: 'Perdida por fallas' },
]

const selectClass =
  'w-full px-3 py-2 bg-white border border-gray-200 rounded-xl text-xs font-semibold text-gray-700 outline-none focus:border-navy-600 focus:ring-2 focus:ring-navy-100'

function pct(value: number | null): string {
  return value === null ? '---' : `${value}%`
}

/**
 * Reporte de asistencia por corte (RF30, RF31): el coordinador elige
 * período y alcance (todo el período o un corte) y ve los indicadores
 * antes de descargar el Excel o el PDF. Los archivos los genera el
 * servidor (/admin/reports/attendance); acá solo se arman los parámetros.
 */
export default function AttendanceReportPanel({
  periods,
  cutsByPeriod,
  subjects,
  professors,
}: {
  periods: PeriodOption[]
  cutsByPeriod: Record<string, CutOption[]>
  subjects: SubjectOption[]
  professors: ProfessorOption[]
}) {
  const [periodId, setPeriodId] = useState(periods[0]?.id || '')
  const [cutId, setCutId] = useState('')
  const [professorId, setProfessorId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [status, setStatus] = useState('')
  const [result, setResult] = useState<{ key: string; summary?: Summary; error?: string } | null>(
    null
  )
  const [downloading, setDownloading] = useState<'xlsx' | 'pdf' | null>(null)
  const showToast = useToast()

  const cuts = useMemo(() => cutsByPeriod[periodId] || [], [cutsByPeriod, periodId])
  const periodSubjects = useMemo(
    () => subjects.filter((s) => s.periodId === periodId),
    [subjects, periodId]
  )
  const periodProfessorIds = useMemo(
    () => new Set(periodSubjects.map((s) => s.professorId).filter(Boolean)),
    [periodSubjects]
  )
  const visibleSubjects = periodSubjects.filter(
    (s) => !professorId || s.professorId === professorId
  )
  const visibleProfessors = professors.filter((p) => periodProfessorIds.has(p.id))

  const query = useMemo(() => {
    const params = new URLSearchParams({ periodId })
    if (cutId) params.set('cutId', cutId)
    if (professorId) params.set('professorId', professorId)
    if (subjectId) params.set('subjectId', subjectId)
    if (status) params.set('status', status)
    return params
  }, [periodId, cutId, professorId, subjectId, status])

  // Indicadores del alcance elegido (RF30). Se piden al mismo endpoint de los
  // archivos, en formato resumen, con un debounce, y se cancelan si el filtro
  // cambia antes de que lleguen.
  const queryKey = query.toString()
  useEffect(() => {
    if (!periodId) return
    const controller = new AbortController()
    const params = new URLSearchParams(queryKey)
    params.set('format', 'summary')

    const timer = setTimeout(() => {
      fetch(`/admin/reports/attendance?${params.toString()}`, { signal: controller.signal })
        .then(async (res) => {
          // Sesión vencida: el proxy redirige a /login y la respuesta es HTML.
          if (isSessionExpired(res)) throw new Error(SESSION_EXPIRED_MESSAGE)
          const body = await res.json().catch(() => null)
          if (!res.ok) throw new Error(body?.error || 'No se pudieron calcular los indicadores.')
          if (!body || typeof body !== 'object' || !('totals' in body)) {
            throw new Error(SESSION_EXPIRED_MESSAGE)
          }
          setResult({ key: queryKey, summary: body as Summary })
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return
          setResult({ key: queryKey, error: err.message })
        })
    }, SUMMARY_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [periodId, queryKey])

  const loading = result?.key !== queryKey
  const summary = result?.summary
  const summaryError = !loading ? result?.error : undefined

  if (periods.length === 0) return null

  const handleDownload = async (format: 'xlsx' | 'pdf') => {
    setDownloading(format)
    const params = new URLSearchParams(query)
    params.set('format', format)
    const result = await downloadReport(
      `/admin/reports/attendance?${params.toString()}`,
      `reporte_asistencia.${format}`
    )
    if (!result.ok) showToast(result.error, 'error')
    setDownloading(null)
  }

  const handlePeriodChange = (next: string) => {
    setPeriodId(next)
    setCutId('')
    setProfessorId('')
    setSubjectId('')
  }

  return (
    <section
      aria-labelledby="attendance-report-title"
      className="bg-white rounded-xl border border-neutral-200/80 p-4 shadow-2xs flex flex-col gap-4"
    >
      <div>
        <h2
          id="attendance-report-title"
          className="text-xs font-bold uppercase tracking-wider text-neutral-500"
        >
          Reportes por corte
        </h2>
        <p className="text-xs text-neutral-400 mt-0.5">
          Indicadores y descarga en Excel o PDF para presentar al cierre de cada corte.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          Período
          <select
            value={periodId}
            onChange={(e) => handlePeriodChange(e.target.value)}
            className={selectClass}
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          Alcance
          <select value={cutId} onChange={(e) => setCutId(e.target.value)} className={selectClass}>
            <option value="">Todo el período</option>
            {cuts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          Docente
          <select
            value={professorId}
            onChange={(e) => {
              setProfessorId(e.target.value)
              setSubjectId('')
            }}
            className={selectClass}
          >
            <option value="">Todos los docentes</option>
            {visibleProfessors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          Materia
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className={selectClass}
          >
            <option value="">Todas las materias</option>
            {visibleSubjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
          Estado
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={selectClass}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cuts.length === 0 && (
        <p className="text-xs text-neutral-500">
          Este período no tiene cortes configurados (o sus fechas son inválidas): el reporte abarca
          todo el período.
        </p>
      )}

      <div aria-live="polite" className="min-h-[68px]">
        {summaryError ? (
          <p className="text-xs font-semibold text-red-700">{summaryError}</p>
        ) : summary ? (
          <div
            className={`grid grid-cols-2 lg:grid-cols-4 gap-3 transition-opacity ${
              loading ? 'opacity-50' : ''
            }`}
          >
            <Indicator
              label="Asistencia promedio"
              value={pct(summary.totals.overallAttendancePct)}
            />
            <Indicator
              label="Estudiantes en riesgo"
              value={String(summary.totals.atRiskStudents)}
              tone="warning"
            />
            <Indicator
              label="Pérdida por fallas"
              value={String(summary.totals.failedStudents)}
              tone="danger"
            />
            <Indicator
              label="Cumplimiento docente"
              value={pct(summary.totals.complianceOverallPct)}
            />
          </div>
        ) : (
          <p className="text-xs text-neutral-400">Calculando indicadores...</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleDownload('xlsx')}
          isLoading={downloading === 'xlsx'}
          disabled={downloading !== null}
          leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-700" strokeWidth={2} />}
        >
          Descargar Excel
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => handleDownload('pdf')}
          isLoading={downloading === 'pdf'}
          disabled={downloading !== null}
          leftIcon={<FileText className="w-4 h-4 text-brand-700" strokeWidth={2} />}
        >
          Descargar PDF
        </Button>
        <span className="hidden sm:flex items-center gap-1 text-[11px] text-neutral-400">
          <Download className="w-3 h-3" strokeWidth={2} />
          El estado de cada estudiante es semestral; los porcentajes corresponden al alcance.
        </span>
      </div>
    </section>
  )
}

function Indicator({
  label,
  value,
  tone = 'neutral',
}: {
  label: string
  value: string
  tone?: 'neutral' | 'warning' | 'danger'
}) {
  const styles = {
    neutral: 'bg-gray-50/70 border-gray-200/60 text-gray-900',
    warning: 'bg-amber-50/60 border-amber-100 text-amber-800',
    danger: 'bg-red-50/60 border-red-100 text-red-800',
  }
  return (
    <div className={`p-3 rounded-xl border ${styles[tone]}`}>
      <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-xl font-black mt-0.5">{value}</p>
    </div>
  )
}
