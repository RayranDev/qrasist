'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { QrCode } from 'lucide-react'

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

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
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
          {/* Icono QR (mismo que login) */}
          <QrCode className="w-12 h-12 text-gray-800" strokeWidth={1.5} />

          {/* Línea de escaneo sobre el ícono */}
          <div
            className="absolute left-0 right-0 h-0.5 rounded-full"
            style={{
              background:
                'linear-gradient(90deg, transparent 0%, #10b981 30%, #34d399 50%, #10b981 70%, transparent 100%)',
              boxShadow: '0 0 6px 1px rgba(52,211,153,0.6)',
              animation: 'qr-scan 0.8s ease-in-out both',
            }}
          />
        </div>

        {/* Texto */}
        <p className="text-xs font-bold text-gray-500 tracking-widest uppercase">QR‑Asist</p>
      </div>
    </div>
  )
}
