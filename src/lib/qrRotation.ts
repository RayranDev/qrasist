// Limites y valor de respaldo de la rotacion del QR. La rotacion es un
// parametro GLOBAL (app_settings.qr_rotation_seconds, migracion 038) que solo
// edita coordinacion: estas constantes son el rango de validacion y el
// respaldo cuando app_settings no tiene la columna o la fila.
// Viven en un archivo aparte porque un modulo 'use server' solo puede
// exportar funciones async -- no puede exportar estas constantes.
export const DEFAULT_ROTATION_SECONDS = 20
export const MIN_ROTATION_SECONDS = 10
export const MAX_ROTATION_SECONDS = 60
