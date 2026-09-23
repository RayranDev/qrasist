import Link from 'next/link'
import { ArrowRight, CheckCircle2 } from 'lucide-react'
import type { AttentionItem } from '@/lib/admin/dashboardAttention'

const TONE_STYLES: Record<AttentionItem['tone'], { dot: string; count: string }> = {
  warning: { dot: 'bg-amber-500', count: 'text-amber-700' },
  danger: { dot: 'bg-rose-500', count: 'text-rose-700' },
  info: { dot: 'bg-navy-500', count: 'text-navy-700' },
}

/**
 * Bloque "Hoy": qué necesita acción del admin ahora mismo. Presentacional
 * puro -- la página arma `items` con conteos reales y hrefs ya resueltos.
 * Con la lista vacía colapsa a una sola línea calma en vez de repetir la
 * grilla de tarjetas idénticas que tenía el dashboard antes.
 */
export default function AttentionArea({ items }: { items: AttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2.5 text-sm text-neutral-500">
        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2} />
        <span>Nada pendiente por ahora.</span>
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2.5">Hoy</h2>
      <ul className="divide-y divide-neutral-200/70 rounded-xl border border-neutral-200/80 bg-white overflow-hidden">
        {items.map((item) => {
          const tone = TONE_STYLES[item.tone]
          const row = (
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${tone.dot}`} aria-hidden="true" />
                <span className="text-sm font-medium text-neutral-800 truncate">{item.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-sm font-bold font-mono ${tone.count}`}>{item.count}</span>
                {item.href && <ArrowRight className="w-3.5 h-3.5 text-neutral-400" />}
              </div>
            </div>
          )

          return (
            <li key={item.key}>
              {item.href ? (
                <Link
                  href={item.href}
                  className="block hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-navy-600 transition-colors"
                >
                  {row}
                </Link>
              ) : (
                row
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
