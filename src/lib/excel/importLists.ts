import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows, unwrapRows, type FetchAllPage } from '@/lib/supabase/fetchAll'
import type { ImportListSource } from './importSchemas'
import type { ImportTemplateLists } from './importTemplate'

type Page = (from: number, to: number) => PromiseLike<FetchAllPage<Record<string, string>>>

/**
 * Consultas de las listas desplegables de las plantillas, siempre contra la
 * base al momento de descargar (nunca cifras fijas). Cada una pagina por
 * `.range()` porque PostgREST corta en silencio a 1000 filas y hay miles de
 * estudiantes. El orden es determinista (valor visible y luego `id`) para que
 * las páginas no repitan ni se salten filas.
 *
 * Materias y estudiantes se ordenan por código: es lo que el admin tiene a mano
 * y lo que se escribe al buscar en la lista; además es único, lo que hace estable
 * la paginación. Carreras, períodos y profesores, por el texto que se ve.
 */
function pageFor(supabase: SupabaseClient, source: ImportListSource): Page {
  switch (source) {
    case 'careers':
      return (from, to) =>
        supabase
          .from('careers')
          .select('name')
          .eq('is_active', true)
          .order('name')
          .order('id')
          .range(from, to)
    case 'periods':
      return (from, to) =>
        supabase
          .from('periods')
          .select('name')
          .eq('is_active', true)
          .order('name', { ascending: false })
          .order('id')
          .range(from, to)
    case 'professors':
      return (from, to) =>
        supabase
          .from('profiles')
          .select('email')
          .eq('role', 'PROFESSOR')
          .eq('is_active', true)
          .not('email', 'is', null)
          .order('email')
          .order('id')
          .range(from, to)
    case 'subjects':
      return (from, to) =>
        supabase
          .from('subjects')
          .select('code, name')
          .eq('is_active', true)
          .order('code')
          .order('id')
          .range(from, to)
    case 'students':
      return (from, to) =>
        supabase
          .from('profiles')
          .select('student_code, name')
          .eq('role', 'STUDENT')
          .eq('is_active', true)
          .not('student_code', 'is', null)
          .order('student_code')
          .order('id')
          .range(from, to)
  }
}

/** Texto de cada opción: materias y estudiantes como "CÓDIGO — Nombre". */
function labelOf(source: ImportListSource, row: Record<string, string>): string {
  switch (source) {
    case 'careers':
    case 'periods':
      return row.name
    case 'professors':
      return row.email
    case 'subjects':
      return `${row.code} — ${row.name}`
    case 'students':
      return `${row.student_code} — ${row.name}`
  }
}

/** Carga los valores activos de las fuentes pedidas; lanza si alguna consulta falla. */
export async function loadImportLists(
  supabase: SupabaseClient,
  sources: ImportListSource[]
): Promise<ImportTemplateLists> {
  const entries = await Promise.all(
    sources.map(async (source) => {
      const rows = unwrapRows(await fetchAllRows(pageFor(supabase, source)), `la lista ${source}`)
      return [source, rows.map((row) => labelOf(source, row))] as const
    })
  )
  return Object.fromEntries(entries)
}
