import {
  capitalizeFirst,
  formatBogotaClock,
  formatBogotaDateTimeLong,
} from '@/lib/utils/spanishDate'

/**
 * Fecha/hora en hora de Colombia, idéntica en el servidor y en el navegador
 * (sin zona horaria del visitante ni locales de ICU), así no hay desajuste
 * de hidratación ni se muestra la hora del huso del navegador.
 *
 *  - variant 'datetime' (por defecto): "miércoles 21 de octubre, 6:02 p. m."
 *  - variant 'time': "6:02 p. m."
 * `capitalize` pone en mayúscula solo la primera letra, para cuando el texto
 * abre una etiqueta; dentro de una frase se deja en minúscula.
 */
export default function LocalTime({
  date,
  variant = 'datetime',
  capitalize = false,
}: {
  date: string
  variant?: 'datetime' | 'time'
  capitalize?: boolean
}) {
  const text = variant === 'time' ? formatBogotaClock(date) : formatBogotaDateTimeLong(date)
  return <span>{capitalize ? capitalizeFirst(text) : text}</span>
}
