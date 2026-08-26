'use client'

import { Monitor } from 'lucide-react'

export default function MobileWarningBanner() {
  return (
    <div className="md:hidden bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-start gap-3">
      <Monitor className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" strokeWidth={2} />
      <p className="text-xs font-semibold text-amber-700 leading-relaxed">
        Para una mejor experiencia, te recomendamos acceder desde un computador.
      </p>
    </div>
  )
}
