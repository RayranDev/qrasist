'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Search } from 'lucide-react'
import FilterPanel, { FilterField } from '@/components/FilterPanel'
import type { RequestsView } from '@/lib/enrollmentRequests/constants'
import { buildRequestsHref } from '@/lib/enrollmentRequests/filters'

interface Career {
  id: string
  name: string
}

const selectClass =
  'px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-navy-600 appearance-none cursor-pointer'

const VIEWS: { value: RequestsView; label: string }[] = [
  { value: 'subject', label: 'Por materia' },
  { value: 'student', label: 'Por estudiante' },
]

export default function RequestsFilters({
  basePath,
  view,
  searchQuery,
  careerFilter,
  careers,
}: {
  basePath: string
  view: RequestsView
  searchQuery: string
  careerFilter?: string
  /** Solo coordinación filtra por carrera; el profesor ve pocas materias. */
  careers?: Career[]
}) {
  const router = useRouter()
  const [query, setQuery] = useState(searchQuery)
  const pendingSearch = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cada cambio de filtro vuelve a la página 1 (no se arrastra `page`).
  const navigate = (overrides: { q?: string; career?: string | null }) => {
    if (pendingSearch.current) clearTimeout(pendingSearch.current)
    pendingSearch.current = null
    router.push(
      buildRequestsHref(basePath, {
        view,
        page: 1,
        filters: {
          q: overrides.q !== undefined ? overrides.q : query.trim(),
          career: overrides.career !== undefined ? overrides.career || undefined : careerFilter,
        },
      })
    )
  }

  // Debounce: esperar a que termine de escribir en vez de consultar por tecla.
  useEffect(() => {
    if (query.trim() === searchQuery) return
    pendingSearch.current = setTimeout(() => navigate({ q: query.trim() }), 400)
    return () => {
      if (pendingSearch.current) clearTimeout(pendingSearch.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <FilterPanel>
      <FilterField label="Vista">
        <nav aria-label="Agrupar solicitudes" className="flex gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v.value}
              href={buildRequestsHref(basePath, {
                view: v.value,
                page: 1,
                filters: { q: searchQuery, career: careerFilter },
              })}
              aria-current={v.value === view ? 'page' : undefined}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                v.value === view
                  ? 'bg-navy-800 text-white'
                  : 'bg-white text-gray-500 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              {v.label}
            </Link>
          ))}
        </nav>
      </FilterField>

      <FilterField label="Buscar">
        <div className="relative min-w-60">
          <Search
            className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            aria-label="Buscar por estudiante o materia"
            placeholder="Estudiante, código o materia..."
            autoComplete="off"
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all"
          />
        </div>
      </FilterField>

      {careers && careers.length > 0 && (
        <FilterField label="Carrera de la materia">
          <select
            value={careerFilter || ''}
            onChange={(e) => navigate({ career: e.target.value || null })}
            aria-label="Filtrar por carrera"
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
      )}
    </FilterPanel>
  )
}
