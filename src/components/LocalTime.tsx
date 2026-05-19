'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { useEffect, useState } from 'react'

export default function LocalTime({ date, formatStr = "EEEE d 'de' MMMM, h:mm a" }: { date: string, formatStr?: string }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Evita errores de hidratación mostrando algo neutro hasta que el cliente renderice
  if (!mounted) return <span className="opacity-0">Cargando hora...</span>

  return <span>{format(new Date(date), formatStr, { locale: es })}</span>
}
