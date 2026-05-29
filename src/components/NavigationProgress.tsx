'use client'

import { useEffect, useState, useRef } from 'react'
import { usePathname } from 'next/navigation'

export default function NavigationProgress() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)
  const [width, setWidth] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevPath = useRef(pathname)

  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname

    // Limpiar cualquier animación anterior
    if (timerRef.current) clearTimeout(timerRef.current)

    // Arrancar barra
    setWidth(0)
    setVisible(true)

    // Avanzar rápido hasta 85%
    const t1 = setTimeout(() => setWidth(85), 30)
    // Completar al 100% y ocultar
    const t2 = setTimeout(() => setWidth(100), 350)
    const t3 = setTimeout(() => {
      setVisible(false)
      setWidth(0)
    }, 650)

    timerRef.current = t3
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [pathname])

  if (!visible) return null

  return (
    <div
      className="fixed top-0 left-0 z-[9999] h-[3px] bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] transition-all duration-300 ease-out pointer-events-none"
      style={{ width: `${width}%` }}
    />
  )
}
