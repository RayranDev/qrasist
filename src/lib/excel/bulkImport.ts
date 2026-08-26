export interface ImportRowError {
  row: number
  message: string
}

export interface ImportResult {
  success: true
  successCount: number
  errors: ImportRowError[]
}

/**
 * Motor compartido de carga masiva: valida y procesa fila por fila,
 * sin detenerse ante un error -- una fila mala no bloquea las demás.
 * `validate` separa parseo/reglas de negocio simples (sin tocar la
 * base) de `insert`, que sí pega contra Supabase.
 */
export async function runBulkImport<T>(
  rows: Record<string, string>[],
  validate: (row: Record<string, string>) => { data: T } | { error: string },
  insert: (data: T) => Promise<{ success: boolean; error?: string }>
): Promise<ImportResult> {
  const errors: ImportRowError[] = []
  let successCount = 0

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2 // fila 1 = encabezados, los datos empiezan en la fila 2
    const validated = validate(rows[i])

    if ('error' in validated) {
      errors.push({ row: rowNumber, message: validated.error })
      continue
    }

    const result = await insert(validated.data)
    if (result.success) {
      successCount++
    } else {
      errors.push({ row: rowNumber, message: result.error || 'Error desconocido.' })
    }
  }

  return { success: true, successCount, errors }
}
