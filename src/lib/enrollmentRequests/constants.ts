// Topes de las operaciones masivas sobre solicitudes de inscripción.
// Viven fuera del archivo 'use server' porque un módulo de server actions
// solo puede exportar funciones async.

/**
 * Máximo de solicitudes por llamada a `approveEnrollmentRequests` /
 * `rejectEnrollmentRequests`. Las ids viajan en la URL de PostgREST
 * (`.in('id', [...])`): 100 uuids son ~4 KB, por debajo del límite de
 * 8 KB de los proxies; con más habría que partir las consultas. La UI
 * parte selecciones más grandes en lotes de este tamaño.
 */
export const BULK_REVIEW_MAX = 100

/**
 * Máximo de solicitudes que "Aprobar todas" procesa en una sola
 * operación (en lotes de BULK_REVIEW_MAX, ~6 consultas por lote). Si hay
 * más, se aprueban las más antiguas y se informa cuántas quedan.
 */
export const APPROVE_ALL_MAX = 500

/**
 * Máximo de filas que se leen para armar la lista o resolver "todas".
 * PostgREST corta en 1000 filas por respuesta, así que se pagina por
 * rangos; este tope evita lecturas sin fin y, si se alcanza, la UI lo
 * avisa en vez de mostrar un total falso.
 */
export const SCAN_MAX = 5000

/** Tamaño de página de lectura contra PostgREST (su límite por defecto). */
export const FETCH_PAGE_SIZE = 1000

/** Paginación de la lista por grupos: un grupo nunca se parte entre páginas. */
export const GROUPS_PER_PAGE = 20
export const ROWS_PER_PAGE = 150

export type RequestsView = 'subject' | 'student'
