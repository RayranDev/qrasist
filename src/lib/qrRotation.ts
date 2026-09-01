// Limites de la rotacion configurable del QR, compartidos entre el
// server action (session.ts, que valida) y la UI del profesor
// (SessionButton.tsx, que los usa como default/min/max del input).
// Viven en un archivo aparte porque un modulo 'use server' solo puede
// exportar funciones async -- no puede exportar estas constantes.
export const DEFAULT_ROTATION_SECONDS = 20
export const MIN_ROTATION_SECONDS = 10
export const MAX_ROTATION_SECONDS = 60
