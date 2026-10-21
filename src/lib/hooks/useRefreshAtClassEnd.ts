'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Margen para que el servidor ya vea la clase como terminada (ahora > fin). */
export const CLASS_END_REFRESH_MARGIN_MS = 1500

// setTimeout guarda el retardo en un entero de 32 bits con signo.
const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Milisegundos hasta refrescar para el fin de clase futuro más cercano, o
 * null si ninguno está en el futuro. Pura: la hora actual se inyecta.
 */
export function msUntilNextClassEnd(
  endsAt: readonly (string | null | undefined)[],
  nowMs: number
): number | null {
  let nearest: number | null = null
  for (const value of endsAt) {
    if (!value) continue
    const end = new Date(value).getTime()
    if (Number.isNaN(end) || end <= nowMs) continue
    if (nearest === null || end < nearest) nearest = end
  }
  if (nearest === null) return null
  return Math.min(nearest - nowMs + CLASS_END_REFRESH_MARGIN_MS, MAX_TIMEOUT_MS)
}

/**
 * Las vistas que dependen de "la clase ya terminó" lo reciben calculado en el
 * servidor (el cliente no debe usar su reloj para decidirlo). Si el docente
 * deja la página abierta, ese valor se queda viejo: este hook programa un
 * router.refresh() justo cuando termina la próxima clase en curso. Al
 * refrescar llegan props nuevas y el efecto programa la siguiente.
 */
export function useRefreshAtClassEnd(endsAt: readonly (string | null | undefined)[]) {
  const router = useRouter()
  // Dependencia estable: el arreglo se recrea en cada render.
  const key = endsAt.filter(Boolean).join('|')

  useEffect(() => {
    const delay = msUntilNextClassEnd(key ? key.split('|') : [], Date.now())
    if (delay === null) return
    const timer = setTimeout(() => router.refresh(), delay)
    return () => clearTimeout(timer)
  }, [key, router])
}
