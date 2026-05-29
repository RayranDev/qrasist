'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

const S = 13 // grid size

// Patrón decorativo que evoca un QR real:
// tres patrones de esquina 5×5 + timing lines + datos pseudo-aleatorios
function buildPattern(): number[][] {
  return Array.from({ length: S }, (_, r) =>
    Array.from({ length: S }, (_, c) => {
      // Esquina superior-izquierda
      if (r < 5 && c < 5) {
        if (r === 0 || r === 4 || c === 0 || c === 4) return 1
        if (r === 1 || r === 3 || c === 1 || c === 3) return 0
        return 1
      }
      // Esquina superior-derecha
      if (r < 5 && c >= S - 5) {
        const cc = c - (S - 5)
        if (r === 0 || r === 4 || cc === 0 || cc === 4) return 1
        if (r === 1 || r === 3 || cc === 1 || cc === 3) return 0
        return 1
      }
      // Esquina inferior-izquierda
      if (r >= S - 5 && c < 5) {
        const rr = r - (S - 5)
        if (rr === 0 || rr === 4 || c === 0 || c === 4) return 1
        if (rr === 1 || rr === 3 || c === 1 || c === 3) return 0
        return 1
      }
      // Timing lines (fila y columna 6)
      if (r === 6 && c > 5 && c < S - 5) return c % 2 === 0 ? 1 : 0
      if (c === 6 && r > 5 && r < S - 5) return r % 2 === 0 ? 1 : 0
      // Datos: pseudo-aleatorio determinístico
      return ((r * 17 + c * 13 + (r ^ c) * 5) % 3) !== 0 ? 1 : 0
    })
  )
}

const PATTERN = buildPattern()

export default function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [show, setShow] = useState(false)
  const prevPath = useRef(pathname)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname

    if (timerRef.current) clearTimeout(timerRef.current)

    setVisible(true)
    setShow(true)

    // Ocultar a los 750ms
    timerRef.current = setTimeout(() => {
      setShow(false)
      setTimeout(() => setVisible(false), 200)
    }, 750)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [pathname])

  if (!visible) return null

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#F7F7F5]/85 backdrop-blur-sm"
      style={{
        opacity: show ? 1 : 0,
        transition: 'opacity 0.2s ease',
      }}
    >
      <div className="flex flex-col items-center gap-5">

        {/* QR animado */}
        <div className="relative p-3 bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">

          {/* Grid de celdas */}
          <div
            className="grid gap-[2.5px]"
            style={{ gridTemplateColumns: `repeat(${S}, 1fr)` }}
          >
            {PATTERN.map((row, r) =>
              row.map((cell, c) => (
                <div
                  key={`${r}-${c}`}
                  className={`w-[18px] h-[18px] rounded-[2px] ${cell ? 'bg-gray-900' : 'bg-transparent'}`}
                  style={cell ? {
                    animation: `qr-cell-in 0.35s ease both`,
                    animationDelay: `${(r + c) * 18}ms`,
                  } : undefined}
                />
              ))
            )}
          </div>

          {/* Línea de escaneo */}
          <div
            className="absolute left-3 right-3 h-[2.5px] rounded-full"
            style={{
              background: 'linear-gradient(90deg, transparent, #10b981, #34d399, #10b981, transparent)',
              boxShadow: '0 0 10px 3px rgba(52, 211, 153, 0.55)',
              animation: 'qr-scan 0.75s ease-in-out both',
            }}
          />

          {/* Esquinas decorativas (superpuestas sobre el QR) */}
          {[
            'top-2 left-2 border-t-2 border-l-2 rounded-tl',
            'top-2 right-2 border-t-2 border-r-2 rounded-tr',
            'bottom-2 left-2 border-b-2 border-l-2 rounded-bl',
            'bottom-2 right-2 border-b-2 border-r-2 rounded-br',
          ].map((cls, i) => (
            <span
              key={i}
              className={`absolute w-5 h-5 border-emerald-400 ${cls}`}
              style={{ animation: 'corner-pulse 1s ease-in-out infinite', animationDelay: `${i * 120}ms` }}
            />
          ))}
        </div>

        {/* Texto */}
        <div className="flex items-center gap-2.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
          <span className="text-sm font-black text-gray-800 tracking-tight">QR‑Asist</span>
        </div>

      </div>
    </div>
  )
}
