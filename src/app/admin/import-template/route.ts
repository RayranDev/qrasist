import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/actions/authGuards'
import { IMPORT_SCHEMA, isImportType } from '@/lib/excel/importSchemas'
import { buildImportTemplate } from '@/lib/excel/importTemplate'

export const runtime = 'nodejs'

/**
 * Plantilla de carga masiva con las carreras (y períodos) ACTIVOS de la
 * base como listas desplegables:
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

  const columns = IMPORT_SCHEMA[type].columns
  const needs = (source: 'careers' | 'periods') => columns.some((c) => c.list === source)

  const [careers, periods] = await Promise.all([
    needs('careers')
      ? supabase.from('careers').select('name').eq('is_active', true).order('name')
      : null,
    needs('periods')
      ? supabase
          .from('periods')
          .select('name')
          .eq('is_active', true)
          .order('name', { ascending: false })
      : null,
  ])
  if (careers?.error || periods?.error) {
    console.error(
      '[import-template] No se pudieron cargar las listas',
      careers?.error,
      periods?.error
    )
    return NextResponse.json({ error: 'No se pudo generar la plantilla.' }, { status: 500 })
  }

  const workbook = await buildImportTemplate(type, {
    careers: (careers?.data || []).map((c) => c.name),
    periods: (periods?.data || []).map((p) => p.name),
  })
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
