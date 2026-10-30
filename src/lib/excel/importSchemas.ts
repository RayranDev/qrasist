import { foldText } from '@/lib/utils/normalizeText'

/**
 * Definición pura (sin Server Actions) de las plantillas de carga masiva.
 * Vive aparte de `importConfig.ts` para que tanto el servidor (parseo y
 * plantilla) como el cliente la importen sin arrastrar las acciones.
 */

export type ImportType = 'STUDENT' | 'PROFESSOR' | 'SUBJECT' | 'ENROLLMENT'

/** De dónde sale la lista desplegable de una columna (valores activos de la base). */
export type ImportListSource = 'careers' | 'periods' | 'professors' | 'subjects' | 'students'

export interface ImportColumn {
  header: string
  key: string
  width?: number
  /** Sin esta columna el archivo no se acepta. Las demás son opcionales. */
  required?: boolean
  /** Se formatea como texto en la plantilla para no perder ceros a la izquierda. */
  text?: boolean
  list?: ImportListSource
  /** Con las demás columnas `identity`, delata la fila de ejemplo de la plantilla. */
  identity?: boolean
}

export interface ImportSchema {
  label: string
  columns: ImportColumn[]
  exampleRow: Record<string, string>
}

/**
 * Tope de filas por archivo. Cada fila de usuario hace varias idas y
 * vueltas a Supabase (createUser incluye hashear la contraseña); con
 * 5 filas en paralelo, 200 filas caben holgadas en los 60 s de
 * `maxDuration` y un solo archivo sigue siendo revisable a mano.
 */
export const MAX_IMPORT_ROWS = 200

/**
 * Tope de tamaño del .xlsx. Los Server Actions rechazan cuerpos de más
 * de 1 MB por defecto; se deja margen para el encabezado multipart. Un
 * archivo de 200 filas pesa unas decenas de KB.
 */
export const MAX_IMPORT_FILE_BYTES = 900 * 1024

const USER_COLUMNS: ImportColumn[] = [
  { header: 'Nombres', key: 'nombres', width: 20, required: true },
  { header: 'Apellidos', key: 'apellidos', width: 20, required: true },
  { header: 'Correo', key: 'correo', width: 32, required: true, identity: true },
  { header: 'Contraseña', key: 'password', width: 16, required: true, text: true },
  { header: 'Código', key: 'codigo', width: 16, required: true, text: true, identity: true },
  { header: 'Carrera', key: 'carrera', width: 30, list: 'careers' },
]

export const IMPORT_SCHEMA: Record<ImportType, ImportSchema> = {
  STUDENT: {
    label: 'Estudiantes',
    columns: USER_COLUMNS,
    exampleRow: {
      nombres: 'Juan',
      apellidos: 'Pérez',
      correo: 'juan.perez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '202512345678',
      carrera: '',
    },
  },
  PROFESSOR: {
    label: 'Docentes',
    columns: USER_COLUMNS,
    exampleRow: {
      nombres: 'María',
      apellidos: 'Gómez',
      correo: 'maria.gomez@urepublicana.edu.co',
      password: 'CambiarClave123',
      codigo: '1122334455',
      carrera: '',
    },
  },
  SUBJECT: {
    label: 'Materias',
    columns: [
      { header: 'Nombre', key: 'nombre', width: 28, required: true, identity: true },
      { header: 'Código', key: 'codigo', width: 16, required: true, text: true, identity: true },
      { header: 'Carrera', key: 'carrera', width: 30, list: 'careers' },
      { header: 'Semestre', key: 'semestre', width: 10 },
      { header: 'Correo Profesor', key: 'correoProfesor', width: 32, list: 'professors' },
      { header: 'Período', key: 'periodo', width: 14, list: 'periods' },
    ],
    exampleRow: {
      nombre: 'Cálculo I',
      codigo: 'CALC-101',
      carrera: '',
      semestre: '1',
      correoProfesor: 'maria.gomez@urepublicana.edu.co',
      periodo: '',
    },
  },
  ENROLLMENT: {
    label: 'Inscripciones',
    columns: [
      {
        header: 'Código Materia',
        key: 'codigoMateria',
        width: 40,
        required: true,
        text: true,
        identity: true,
        list: 'subjects',
      },
      {
        header: 'Código Estudiante',
        key: 'codigoEstudiante',
        width: 40,
        required: true,
        text: true,
        identity: true,
        list: 'students',
      },
    ],
    exampleRow: {
      codigoMateria: 'CALC-101',
      codigoEstudiante: '202512345678',
    },
  },
}

export function isImportType(value: string | null): value is ImportType {
  return value !== null && Object.prototype.hasOwnProperty.call(IMPORT_SCHEMA, value)
}

export function headersOf(type: ImportType, kind: 'required' | 'optional'): string[] {
  return IMPORT_SCHEMA[type].columns
    .filter((c) => Boolean(c.required) === (kind === 'required'))
    .map((c) => c.header)
}

/**
 * ¿La fila es la de ejemplo de la plantilla sin tocar? Subirla tal cual
 * crearía una cuenta real con una contraseña conocida, así que el servidor
 * la rechaza. Se compara solo el conjunto de columnas `identity`.
 */
export function isExampleRow(type: ImportType, row: Record<string, string>): boolean {
  const { columns, exampleRow } = IMPORT_SCHEMA[type]
  const identity = columns.filter((c) => c.identity)
  return identity.every((c) => foldText(row[c.header] ?? '') === foldText(exampleRow[c.key] ?? ''))
}

/** Separador canónico de las listas desplegables: "CÓDIGO — Nombre". */
export const LIST_LABEL_SEPARATOR = ' \u2014 '

/**
 * Códigos posibles de una celda de código de una lista desplegable, en el
 * orden en que hay que probarlos. Un código puede llevar guion con espacios
 * ("CALC - 101") y el nombre también, así que NUNCA se corta a ciegas:
 *   1. el valor completo, tal cual (lo que escribe quien teclea el código);
 *   2. lo anterior al primer " — " canónico (el valor mostrado por la lista);
 *   3. solo si no hay " — ": lo anterior a una raya media o guion con espacios,
 *      por si el valor se retocó a mano.
 * El llamador consulta en ese orden y se queda con el primero que existe.
 */
export function codeCandidates(value: string): string[] {
  const full = value.trim()
  const split = full.includes(LIST_LABEL_SEPARATOR)
    ? full.split(LIST_LABEL_SEPARATOR)[0]
    : full.split(/\s+[\u2013-]\s+/)[0]
  const candidates = [full]
  if (split.trim() && split.trim() !== full) candidates.push(split.trim())
  return candidates
}
