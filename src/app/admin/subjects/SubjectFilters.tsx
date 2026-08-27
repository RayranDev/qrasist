'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import FilterPanel, { FilterField } from '@/components/FilterPanel'

interface Career {
  id: string
  name: string
  code: string
}

interface Professor {
  id: string
  name: string
}

const selectClass =
  'px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-emerald-500 appearance-none cursor-pointer'

export default function SubjectFilters({
  careers,
  professors,
  availableLevels,
  careerFilter,
  levelFilter,
  professorFilter,
  statusFilter,
  inactiveCount,
}: {
  careers: Career[]
  professors: Professor[]
  availableLevels: number[]
  careerFilter?: string
  levelFilter?: number
  professorFilter?: string
  statusFilter: 'active' | 'inactive'
  inactiveCount: number
}) {
  const router = useRouter()

  const navigate = (overrides: Record<string, string | undefined>) => {
    const params = new URLSearchParams()
    const next = {
      career: careerFilter,
      level: levelFilter ? String(levelFilter) : undefined,
      professor: professorFilter,
      status: statusFilter !== 'active' ? statusFilter : undefined,
      ...overrides,
    }
    if (next.career) params.set('career', next.career)
    if (next.level) params.set('level', next.level)
    if (next.professor) params.set('professor', next.professor)
    if (next.status) params.set('status', next.status)
    const qs = params.toString()
    router.push(qs ? `?${qs}` : '?')
  }

  return (
    <FilterPanel>
      <FilterField label="Carrera">
        <select
          value={careerFilter || ''}
          onChange={(e) => navigate({ career: e.target.value || undefined, level: undefined })}
          className={selectClass}
        >
          <option value="">Todas</option>
          {careers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterField>

      {careerFilter && availableLevels.length > 0 && (
        <FilterField label="Semestre">
          <select
            value={levelFilter || ''}
            onChange={(e) => navigate({ level: e.target.value || undefined })}
            className={selectClass}
          >
            <option value="">Todos</option>
            {availableLevels.map((lvl) => (
              <option key={lvl} value={lvl}>
                Semestre {lvl}
              </option>
            ))}
          </select>
        </FilterField>
      )}

      <FilterField label="Profesor">
        <select
          value={professorFilter || ''}
          onChange={(e) => navigate({ professor: e.target.value || undefined })}
          className={selectClass}
        >
          <option value="">Todos</option>
          <option value="unassigned">Sin asignar</option>
          {professors.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Estado">
        <div className="flex gap-2">
          <Link
            href={buildStatusHref('active', careerFilter, levelFilter, professorFilter)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${statusFilter === 'active' ? 'bg-emerald-600 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'}`}
          >
            Activas
          </Link>
          <Link
            href={buildStatusHref('inactive', careerFilter, levelFilter, professorFilter)}
            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${statusFilter === 'inactive' ? 'bg-amber-500 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:bg-amber-50'}`}
          >
            Archivadas
            {inactiveCount > 0 && (
              <span
                className={`text-xs rounded-full px-1.5 py-0.5 font-black ${statusFilter === 'inactive' ? 'bg-white/20' : 'bg-amber-100 text-amber-700'}`}
              >
                {inactiveCount}
              </span>
            )}
          </Link>
        </div>
      </FilterField>
    </FilterPanel>
  )
}

function buildStatusHref(
  status: 'active' | 'inactive',
  career?: string,
  level?: number,
  professor?: string
) {
  const params = new URLSearchParams()
  if (career) params.set('career', career)
  if (level) params.set('level', String(level))
  if (professor) params.set('professor', professor)
  if (status !== 'active') params.set('status', status)
  const qs = params.toString()
  return qs ? `?${qs}` : '?'
}
