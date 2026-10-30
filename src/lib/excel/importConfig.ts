import {
  bulkImportStudents,
  bulkImportProfessors,
  bulkImportSubjects,
  bulkImportEnrollments,
} from '@/lib/actions/bulkImport'
import { IMPORT_SCHEMA, type ImportSchema, type ImportType } from './importSchemas'

export type { ImportType }

export interface ImportResult {
  success: true
  successCount: number
  errors: { row: number; message: string }[]
}

export type ImportActionResult = ImportResult | { success: false; error: string }

export const IMPORT_CONFIG: Record<
  ImportType,
  ImportSchema & { action: (formData: FormData) => Promise<ImportActionResult> }
> = {
  STUDENT: { ...IMPORT_SCHEMA.STUDENT, action: bulkImportStudents },
  PROFESSOR: { ...IMPORT_SCHEMA.PROFESSOR, action: bulkImportProfessors },
  SUBJECT: { ...IMPORT_SCHEMA.SUBJECT, action: bulkImportSubjects },
  ENROLLMENT: { ...IMPORT_SCHEMA.ENROLLMENT, action: bulkImportEnrollments },
}
