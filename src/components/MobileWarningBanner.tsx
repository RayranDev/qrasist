'use client'

export default function MobileWarningBanner() {
  return (
    <div className="md:hidden bg-amber-50 border-b border-amber-100 px-4 py-3 flex items-start gap-3">
      <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
      <p className="text-xs font-semibold text-amber-700 leading-relaxed">
        Para una mejor experiencia, te recomendamos acceder desde un computador.
      </p>
    </div>
  )
}
