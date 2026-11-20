/**
 * Carga de datos del panel de control del administrador que alimenta el
 * presentismo institucional y los estudiantes en riesgo.
 *
 * Son consultas sobre toda la institución, así que pasan de las 1000 filas
 * que PostgREST devuelve como máximo por respuesta (`max_rows`): sin paginar,
 * el panel mostraba "1000 marcas" aunque hubiera más y calculaba el
 * presentismo con una muestra. Cada consulta se pagina con `fetchAllRows` en
 * modo `untilEmpty` (el `max_rows` de producción puede ser menor a 1000, y
 * entonces una página corta no significa que se acabaron las filas) y con un
 * `order` sobre la clave primaria para que las páginas no se solapen ni se
 * salten filas. Si una página falla se lanza el error en lugar de calcular
 * indicadores con datos parciales.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, unwrapRows } from '@/lib/supabase/fetchAll'

const PAGE_SIZE = 1000

export interface DashboardSessionRow {
  id: string
  subject_id: string
  date: string
  class_ends_at: string | null
}

export interface DashboardAttendanceRow {
  id: string
  student_id: string
  session_id: string
  status: string
  // El embed `session:sessions(...)` llega tipado como array en supabase-js;
  // el consumidor lo castea al leerlo, igual que antes de paginar.
  session: unknown
}

export interface DashboardJustificationRow {
  id: string
  student_id: string
  subject_id: string
}

export interface DashboardEnrollmentRow {
  id: string
  student_id: string
  subject_id: string
}

export interface DashboardAttendanceData {
  activeSessions: DashboardSessionRow[]
  attendances: DashboardAttendanceRow[]
  approvedJustifications: DashboardJustificationRow[]
  enrollments: DashboardEnrollmentRow[]
}

export async function fetchDashboardAttendanceData(
  supabase: SupabaseClient
): Promise<DashboardAttendanceData> {
  const [sessions, attendances, justifications, enrollments] = await Promise.all([
    fetchAllRows<DashboardSessionRow>(
      (from, to) =>
        supabase
          .from('sessions')
          .select('id, subject_id, date, class_ends_at')
          .eq('is_active', true)
          .order('id')
          .range(from, to),
      PAGE_SIZE,
      { untilEmpty: true }
    ),
    fetchAllRows<DashboardAttendanceRow>(
      (from, to) =>
        supabase
          .from('attendances')
          .select('id, student_id, session_id, status, session:sessions(subject_id, is_active)')
          .order('id')
          .range(from, to),
      PAGE_SIZE,
      { untilEmpty: true }
    ),
    // Justificaciones aprobadas: descuentan la falta en computeAttendanceSummary.
    fetchAllRows<DashboardJustificationRow>(
      (from, to) =>
        supabase
          .from('absence_justifications')
          .select('id, student_id, subject_id')
          .eq('status', 'APPROVED')
          .order('id')
          .range(from, to),
      PAGE_SIZE,
      { untilEmpty: true }
    ),
    fetchAllRows<DashboardEnrollmentRow>(
      (from, to) =>
        supabase
          .from('enrollments')
          .select('id, student_id, subject_id')
          .order('id')
          .range(from, to),
      PAGE_SIZE,
      { untilEmpty: true }
    ),
  ])

  return {
    activeSessions: dedupeById(unwrapRows(sessions, 'las sesiones activas')),
    attendances: dedupeById(unwrapRows(attendances, 'las asistencias')),
    approvedJustifications: dedupeById(unwrapRows(justifications, 'las justificaciones aprobadas')),
    enrollments: dedupeById(unwrapRows(enrollments, 'las inscripciones')),
  }
}

/**
 * El paginado por offset no es una foto consistente: si se insertan filas
 * mientras se pagina (asistencias en vivo), una fila puede correrse y
 * aparecer al final de una página y al principio de la siguiente. Se
 * descartan los duplicados por `id` para no contar una marca dos veces.
 *
 * Lo inverso (una fila que se salta) sigue siendo teóricamente posible con
 * paginado por offset: la solución de fondo es un agregado SQL o una función
 * RPC que cuente en una sola consulta, no traer todas las filas.
 */
function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const byId = new Map<string, T>()
  for (const row of rows) {
    if (!byId.has(row.id)) byId.set(row.id, row)
  }
  return Array.from(byId.values())
}
