import Link from 'next/link'
import { Circle, CheckCircle2 } from 'lucide-react'
import type { OnboardingStep } from '@/lib/admin/dashboardAttention'

/**
 * Checklist de primeros pasos para una institución nueva o incompleta.
 * Cada paso se deriva de conteos reales (ver dashboardAttention.ts) --
 * no hay estado "completado" que pueda desincronizarse. La página
 * decide si renderizar esto: se oculta apenas todos los pasos quedan
 * hechos, sin necesidad de un estado de "descartado".
 */
export default function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  return (
    <div className="rounded-xl border border-navy-200/70 bg-navy-50/40 p-5">
      <h2 className="text-xs font-bold uppercase tracking-wider text-navy-800 mb-1">
        Primeros pasos
      </h2>
      <p className="text-xs text-neutral-500 mb-3">
        Completá esta configuración inicial para dejar la institución lista.
      </p>
      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li key={step.key}>
            {step.done ? (
              <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" strokeWidth={2} />
                <span className="text-sm text-neutral-400 line-through decoration-neutral-300">
                  {step.label}
                </span>
              </div>
            ) : (
              <Link
                href={step.href}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-600 group"
              >
                <Circle className="w-4 h-4 text-navy-400 shrink-0" strokeWidth={2} />
                <span className="text-sm font-medium text-neutral-800 group-hover:text-navy-800">
                  {index + 1}. {step.label}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ol>
    </div>
  )
}
