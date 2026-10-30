// Identifica la vista del listado de materias (estado, búsqueda y filtros).
// La página queda fuera a propósito: paginar no cambia de vista. JSON.stringify
// evita colisiones que daría un separador simple (p. ej. "a|b" vs "a" + "b").
export function buildSubjectsViewKey(view: {
  status: string
  q?: string
  career?: string
  level?: number
  professor?: string
}): string {
  return JSON.stringify([view.status, view.q, view.career, view.level, view.professor])
}
