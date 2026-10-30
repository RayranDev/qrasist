export interface ImportRowError {
  row: number
  message: string
}

export interface ImportResult {
  success: true
  successCount: number
  errors: ImportRowError[]
}

export interface BulkImportOptions {
  /** Número real de cada fila en la hoja; por defecto fila i = i + 2. */
  rowNumbers?: number[]
  /** Filas procesadas en paralelo en la fase de inserción (por defecto 1). */
  concurrency?: number
}

/**
 * Motor compartido de carga masiva: valida y procesa fila por fila,
 * sin detenerse ante un error -- una fila mala no bloquea las demás.
 * `validate` separa parseo/reglas de negocio simples (sin tocar la
 * base) de `insert`, que sí pega contra Supabase. Primero se valida
 * todo el archivo y luego se insertan las filas válidas, `concurrency`
 * a la vez, para que un archivo grande no se pase del tiempo máximo de
 * la acción. Una excepción en una fila se reporta como error de esa
 * fila y no aborta el resto.
 */
export async function runBulkImport<T>(
  rows: Record<string, string>[],
  validate: (row: Record<string, string>, rowNumber: number) => { data: T } | { error: string },
  insert: (data: T) => Promise<{ success: boolean; error?: string }>,
  options: BulkImportOptions = {}
): Promise<ImportResult> {
  const { rowNumbers, concurrency = 1 } = options
  const errors: ImportRowError[] = []
  const valid: { rowNumber: number; data: T }[] = []

  rows.forEach((row, i) => {
    // fila 1 = encabezados, los datos empiezan en la fila 2
    const rowNumber = rowNumbers?.[i] ?? i + 2
    try {
      const validated = validate(row, rowNumber)
      if ('error' in validated) errors.push({ row: rowNumber, message: validated.error })
      else valid.push({ rowNumber, data: validated.data })
    } catch (err) {
      console.error('[bulkImport] Error al validar la fila', rowNumber, err)
      errors.push({ row: rowNumber, message: 'Error inesperado al validar la fila.' })
    }
  })

  let successCount = 0
  let cursor = 0
  const worker = async () => {
    while (cursor < valid.length) {
      const item = valid[cursor++]
      try {
        const result = await insert(item.data)
        if (result.success) {
          successCount++
        } else {
          errors.push({ row: item.rowNumber, message: result.error || 'Error desconocido.' })
        }
      } catch (err) {
        console.error('[bulkImport] Error al procesar la fila', item.rowNumber, err)
        errors.push({ row: item.rowNumber, message: 'Error inesperado al procesar la fila.' })
      }
    }
  }
  const workers = Math.min(Math.max(1, concurrency), valid.length)
  await Promise.all(Array.from({ length: workers }, worker))

  errors.sort((a, b) => a.row - b.row)
  return { success: true, successCount, errors }
}
