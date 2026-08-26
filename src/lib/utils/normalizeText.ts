/**
 * Quita espacios al inicio/final y colapsa espacios internos
 * repetidos a uno solo. Se usa en cada campo de nombre/apellido
 * antes de guardarlo -- evita que "Juan   Pérez " o " Juan Pérez"
 * queden así en la base.
 */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}
