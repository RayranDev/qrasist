/**
 * Quita espacios al inicio/final y colapsa espacios internos
 * repetidos a uno solo. Se usa en cada campo de nombre/apellido
 * antes de guardarlo -- evita que "Juan   Pérez " o " Juan Pérez"
 * queden así en la base.
 */
export function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

/**
 * Forma "plegada" para comparar textos escritos a mano (encabezados de
 * Excel, nombres de carrera o período): sin tildes, sin mayúsculas, con
 * espacios (incluidos los no separables) colapsados y recortados. Solo
 * sirve para comparar, nunca para guardar.
 */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}
