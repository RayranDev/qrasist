/**
 * Concordancia de número en español para textos de la interfaz.
 * 0 y cualquier cantidad distinta de 1 van en plural ("0 faltas",
 * "2 faltas"); solo 1 va en singular ("1 falta").
 */

/** Solo la palabra: pluralize(1, 'falta') -> 'falta'; pluralize(2, 'falta') -> 'faltas'. */
export function pluralize(count: number, singular: string, plural?: string): string {
  if (count === 1) return singular
  if (plural) return plural
  // Palabras terminadas en consonante (justificación, mes) llevan "es".
  return /[aeiouáéíóú]$/i.test(singular) ? `${singular}s` : `${singular}es`
}

/** Cantidad + palabra: countOf(1, 'falta') -> '1 falta'; countOf(2, 'falta') -> '2 faltas'. */
export function countOf(count: number, singular: string, plural?: string): string {
  return `${count} ${pluralize(count, singular, plural)}`
}

/** 'queda 1 falta' / 'quedan 2 faltas' (con el verbo concordando). */
export function remainingOf(count: number, singular: string, plural?: string): string {
  return `${count === 1 ? 'queda' : 'quedan'} ${countOf(count, singular, plural)}`
}
