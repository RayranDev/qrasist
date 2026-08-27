'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import { FilterField } from '@/components/FilterPanel'

interface Career {
  id: string
  name: string
  code: string
}

export default function UserSearchBar({
  careers,
  initialQuery,
  careerFilter,
  roleFilter,
  statusFilter,
}: {
  careers: Career[]
  initialQuery: string
  careerFilter?: string
  roleFilter: string
  statusFilter: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  // Construye la URL solo a partir de valores que ya conocemos
  // (props + estado local), nunca leyendo window.location -- evita
  // una condicion de carrera si el usuario cambia varios filtros
  // en rapida sucesion mientras un debounce todavia esta pendiente.
  const navigate = (nextQuery: string, nextCareer: string | undefined) => {
    const params = new URLSearchParams()
    if (roleFilter !== 'ALL') params.set('role', roleFilter)
    if (statusFilter !== 'active') params.set('status', statusFilter)
    if (nextCareer) params.set('career', nextCareer)
    if (nextQuery) params.set('q', nextQuery)
    const qs = params.toString()
    router.push(qs ? `?${qs}` : '?')
  }

  // Debounce: no navegar en cada tecla, esperar a que el admin
  // deje de escribir para no disparar una consulta por caracter.
  useEffect(() => {
    if (query === initialQuery) return
    const timeout = setTimeout(() => navigate(query, careerFilter), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  return (
    <>
      <FilterField label="Buscar">
        <div className="relative min-w-50">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="text"
            placeholder="Nombre o código..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 transition-all"
          />
        </div>
      </FilterField>
      <FilterField label="Carrera">
        <select
          value={careerFilter || ''}
          onChange={(e) => navigate(query, e.target.value || undefined)}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-emerald-500 appearance-none cursor-pointer"
        >
          <option value="">Todas</option>
          {careers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </FilterField>
    </>
  )
}
