'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const prevPath = useRef(pathname)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname

    if (timerRef.current) clearTimeout(timerRef.current)

    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), 800)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pathname])

  if (!visible) return null

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center pointer-events-none">
      {/* Fondo muy sutil */}
      <div className="absolute inset-0 bg-white/30 backdrop-blur-[2px]" />

      {/* Card flotante pequeña */}
      <div className="relative flex flex-col items-center gap-3 bg-white/90 rounded-2xl px-7 py-6 shadow-lg border border-gray-100">

        {/* Icono QR con línea de escaneo */}
        <div className="relative w-14 h-14 flex items-center justify-center">
          {/* SVG del icono QR (mismo que login) */}
          <svg
            className="w-12 h-12 text-gray-800"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm14 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
            />
          </svg>

          {/* Línea de escaneo sobre el ícono */}
          <div
            className="absolute left-0 right-0 h-0.5 rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)',
              boxShadow: '0 0 6px 1px rgba(52,211,153,0.6)',
              animation: 'qr-scan 0.8s ease-in-out both',
            }}
          />
        </div>

        {/* Texto */}
        <p className="text-xs font-bold text-gray-500 tracking-widest uppercase">
          QR‑Asist
        </p>
      </div>
    </div>
  )
}
