import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { IMPORT_SCHEMA, isImportType } from '@/lib/excel/importSchemas'
import { buildImportTemplate } from '@/lib/excel/importTemplate'
import { loadImportLists } from '@/lib/excel/importLists'

export const runtime = 'nodejs'
// Las listas de estudiantes pueden ser de miles de filas y se leen por páginas.
export const maxDuration = 60

/**
 * Plantilla de carga masiva con los datos ACTIVOS del sistema (carreras,
 * períodos, profesores, materias, estudiantes) como listas desplegables:
 *   GET /admin/import-template?type=STUDENT|PROFESSOR|SUBJECT|ENROLLMENT
 * Se genera al descargar para que la lista nunca quede desactualizada.
 * Solo ADMIN activo.
 */
export async function GET(request: NextRequest) {
  const type = request.nextUrl.searchParams.get('type')
  if (!isImportType(type)) {
    return NextResponse.json({ error: 'Tipo de plantilla no válido.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado.' }, { status: 401 })
  }
  if (!(await checkAdmin(supabase, user.id))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const sources = Array.from(
    new Set(IMPORT_SCHEMA[type].columns.flatMap((c) => (c.list ? [c.list] : [])))
  )

  let lists
  try {
    lists = await loadImportLists(supabase, sources)
  } catch (error) {
    console.error('[import-template] No se pudieron cargar las listas', error)
    return NextResponse.json({ error: 'No se pudo generar la plantilla.' }, { status: 500 })
  }

  const workbook = await buildImportTemplate(type, lists)
  const buffer = await workbook.xlsx.writeBuffer()
  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="plantilla_${IMPORT_SCHEMA[type].label.toLowerCase()}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}
