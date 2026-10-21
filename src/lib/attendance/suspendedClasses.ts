/**
 * Clases suspendidas (RF20) para coordinación: quién las suspendió, el
 * motivo y cuántas asistencias quedaron conservadas. No es 'use server':
 * lo importan páginas del servidor. RLS decide qué ve cada rol (ADMIN todo).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from '@/lib/supabase/fetchAll'

export interface SuspendedClassItem {
  sessionId: string
  subjectId: string
  subjectName: string
  subjectCode: string
  professorId: string | null
  professorName: string | null
  /** Inicio de la clase suspendida (ISO). */
  date: string
  suspendedAt: string
  suspendedByName: string | null
  reason: string
  attendancesKept: number
}

interface Named {
  name: string
}

interface SuspendedRow {
  id: string
  subject_id: string
  date: string
  suspended_at: string
  suspension_reason: string | null
  subject:
    | {
        name: string
        code: string
        professor_id: string | null
        professor: Named | Named[] | null
      }
    | {
        name: string
        code: string
        professor_id: string | null
        professor: Named | Named[] | null
      }[]
    | null
  suspender: Named | Named[] | null
  attendances: { count: number }[] | null
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/** Todas las clases suspendidas, de la suspensión más reciente a la más antigua. */
export async function fetchSuspendedClasses(
  supabase: SupabaseClient
): Promise<SuspendedClassItem[]> {
  const { data } = await fetchAllRows<SuspendedRow>((from, to) =>
    supabase
      .from('sessions')
      // sessions tiene una sola FK hacia profiles (suspended_by, migración
      // 029), pero se fija igual para que un FK futuro no la vuelva ambigua.
      .select(
        'id, subject_id, date, suspended_at, suspension_reason, subject:subjects(name, code, professor_id, professor:profiles(name)), suspender:profiles!sessions_suspended_by_fkey(name), attendances(count)'
      )
      .not('suspended_at', 'is', null)
      .order('suspended_at', { ascending: false })
      .order('id')
      .range(from, to)
  )

  return data.map((row) => {
    const subject = first(row.subject)
    return {
      sessionId: row.id,
      subjectId: row.subject_id,
      subjectName: subject?.name ?? 'Materia',
      subjectCode: subject?.code ?? '',
      professorId: subject?.professor_id ?? null,
      professorName: first(subject?.professor)?.name ?? null,
      date: row.date,
      suspendedAt: row.suspended_at,
      suspendedByName: first(row.suspender)?.name ?? null,
      reason: row.suspension_reason ?? '',
      attendancesKept: row.attendances?.[0]?.count ?? 0,
    }
  })
}

export const RECENT_SUSPENSION_DAYS = 7

/** Cuántas clases se suspendieron en los últimos `days` días (default 7). */
export async function countRecentSuspensions(
  supabase: SupabaseClient,
  now: Date = new Date(),
  days: number = RECENT_SUSPENSION_DAYS
): Promise<number> {
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()
  const { count } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .not('suspended_at', 'is', null)
    .gte('suspended_at', since)
  return count ?? 0
}
