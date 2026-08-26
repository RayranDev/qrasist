'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useSyncExternalStore } from 'react'

// No hay ningún store externo real al que suscribirse: usamos useSyncExternalStore
// únicamente para diferenciar el snapshot de servidor (false) del de cliente (true)
// sin llamar a setState dentro de un efecto (evita cascading renders).
function subscribe() {
  return () => {}
}

export default function LocalTime({
  date,
  formatStr = "EEEE d 'de' MMMM, h:mm a",
}: {
  date: string
  formatStr?: string
}) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false
  )

  // Evita errores de hidratación mostrando algo neutro hasta que el cliente renderice
  if (!mounted) return <span className="opacity-0">Cargando hora...</span>

  return <span>{format(new Date(date), formatStr, { locale: es })}</span>
}
