import {
  bulkImportStudents,
  bulkImportProfessors,
  bulkImportSubjects,
  bulkImportEnrollments,
} from '@/lib/actions/bulkImport'

export type ImportType = 'STUDENT' | 'PROFESSOR' | 'SUBJECT' | 'ENROLLMENT'

export interface ImportResult {
  success: true
  successCount: number
  errors: { row: number; message: string }[]
}

export type ImportActionResult = ImportResult | { success: false; error: string }

export const IMPORT_CONFIG: Record<
  ImportType,
  {
    label: string
    columns: { header: string; key: string; width?: number }[]
    exampleRow: Record<string, string>
    action: (formData: FormData) => Promise<ImportActionResult>
  }
> = {
  STUDENT: {
    label: 'Estudiantes',
    columns: [
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Correo', key: 'correo', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Código', key: 'codigo', width: 16 },
    ],
    exampleRow: {
      nombres: 'Juan',
      apellidos: 'Pérez',
      correo: 'juan.perez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '202512345678',
    },
    action: bulkImportStudents,
  },
  PROFESSOR: {
    label: 'Docentes',
    columns: [
      { header: 'Nombres', key: 'nombres', width: 20 },
      { header: 'Apellidos', key: 'apellidos', width: 20 },
      { header: 'Correo', key: 'correo', width: 32 },
      { header: 'Contraseña', key: 'password', width: 16 },
      { header: 'Código', key: 'codigo', width: 16 },
    ],
    exampleRow: {
      nombres: 'María',
      apellidos: 'Gómez',
      correo: 'maria.gomez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '1122334455',
    },
    action: bulkImportProfessors,
  },
  SUBJECT: {
    label: 'Materias',
    columns: [
      { header: 'Nombre', key: 'nombre', width: 28 },
      { header: 'Código', key: 'codigo', width: 16 },
      { header: 'Carrera', key: 'carrera', width: 26 },
      { header: 'Semestre', key: 'semestre', width: 8 },
      { header: 'Correo Profesor', key: 'correoProfesor', width: 32 },
      { header: 'Período', key: 'periodo', width: 14 },
    ],
    exampleRow: {
      nombre: 'Cálculo I',
      codigo: 'CALC-101',
      carrera: 'Ingeniería de Sistemas',
      semestre: '1',
      correoProfesor: 'maria.gomez@urepublicana.edu.co',
      periodo: '2026-1',
    },
    action: bulkImportSubjects,
  },
  ENROLLMENT: {
    label: 'Inscripciones',
    columns: [
      { header: 'Código Materia', key: 'codigoMateria', width: 18 },
      { header: 'Código Estudiante', key: 'codigoEstudiante', width: 20 },
    ],
    exampleRow: {
      codigoMateria: 'CALC-101',
      codigoEstudiante: '202512345678',
    },
    action: bulkImportEnrollments,
  },
}
