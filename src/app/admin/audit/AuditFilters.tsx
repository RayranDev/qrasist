'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search } from 'lucide-react'
import FilterPanel, { FilterField } from '@/components/FilterPanel'

export default function AuditFilters({
  actionOptions,
  initialAction,
  initialActor,
  initialFrom,
  initialTo,
}: {
  actionOptions: [string, string][]
  initialAction: string
  initialActor: string
  initialFrom: string
  initialTo: string
}) {
  const router = useRouter()
  const [actor, setActor] = useState(initialActor)
  const [action, setAction] = useState(initialAction)
  const [from, setFrom] = useState(initialFrom)
  const [to, setTo] = useState(initialTo)

  const navigate = (next: { actor: string; action: string; from: string; to: string }) => {
    const qs = new URLSearchParams()
    if (next.action) qs.set('action', next.action)
    if (next.actor) qs.set('actor', next.actor)
    if (next.from) qs.set('from', next.from)
    if (next.to) qs.set('to', next.to)
    const s = qs.toString()
    router.push(s ? `?${s}` : '?')
  }

  // Debounce solo en el campo de texto libre (actor); los selects y
  // fechas navegan al instante, igual que UserSearchBar.
  useEffect(() => {
    if (actor === initialActor) return
    const timeout = setTimeout(() => navigate({ actor, action, from, to }), 400)
    return () => clearTimeout(timeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actor])

  return (
    <FilterPanel>
      <FilterField label="Buscar actor">
        <div className="relative min-w-50">
          <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            type="text"
            placeholder="Nombre o correo..."
            className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-navy-600 focus:ring-2 focus:ring-navy-100 transition-all"
          />
        </div>
      </FilterField>

      <FilterField label="Acción">
        <select
          value={action}
          onChange={(e) => {
            setAction(e.target.value)
            navigate({ actor, action: e.target.value, from, to })
          }}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-navy-600 appearance-none cursor-pointer"
        >
          <option value="">Todas</option>
          {actionOptions.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </FilterField>

      <FilterField label="Desde">
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value)
            navigate({ actor, action, from: e.target.value, to })
          }}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-navy-600"
        />
      </FilterField>

      <FilterField label="Hasta">
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value)
            navigate({ actor, action, from, to: e.target.value })
          }}
          className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-700 outline-none focus:bg-white focus:border-navy-600"
        />
      </FilterField>
    </FilterPanel>
  )
}
