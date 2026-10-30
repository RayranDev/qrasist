'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { normalizeName } from '@/lib/utils/normalizeText'
import { parseWorkbookRows } from '@/lib/excel/parseWorkbook'
import { runBulkImport, type ImportResult } from '@/lib/excel/bulkImport'
import { buildNameLookup } from '@/lib/excel/nameLookup'
import {
  codeCandidates,
  headersOf,
  isExampleRow,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  type ImportType,
} from '@/lib/excel/importSchemas'
import { checkStudentEnrollable } from './enrollmentGuards'

type ActionResult = ImportResult | { success: false; error: string }

// Filas insertadas en paralelo: con 200 filas (tope) y ~0,6 s por fila de
// usuario, 5 en paralelo dejan el archivo completo muy por debajo de maxDuration.
const IMPORT_CONCURRENCY = 5

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) return null
  return { supabase, user }
}

async function readFileRows(
  formData: FormData,
  type: ImportType
): Promise<{ rows: Record<string, string>[]; rowNumbers: number[] } | { error: string }> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No se recibió ningún archivo.' }
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    return { error: 'El archivo es demasiado grande. Divídelo en varios archivos.' }
  }

  let parsed
  try {
    parsed = await parseWorkbookRows(file, {
      required: headersOf(type, 'required'),
      optional: headersOf(type, 'optional'),
      maxRows: MAX_IMPORT_ROWS,
    })
  } catch {
    return { error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' }
  }
  if (parsed.missingHeaders.length > 0) {
    return {
      error: `Faltan columnas en el archivo: ${parsed.missingHeaders.join(', ')}. Descarga la plantilla y úsala como base.`,
    }
  }
  if (parsed.rows.length === 0) return { error: 'El archivo no tiene filas para importar.' }
  if (parsed.truncated) {
    return {
      error: `El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Divídelo en archivos de máximo ${MAX_IMPORT_ROWS} filas.`,
    }
  }
  return { rows: parsed.rows, rowNumbers: parsed.rowNumbers }
}

const EXAMPLE_ROW_ERROR = 'Es la fila de ejemplo de la plantilla: bórrala antes de importar.'

function careerLookupError(name: string, reason: 'unknown' | 'inactive' | 'ambiguous') {
  if (reason === 'inactive') return `La carrera "${name}" está inactiva.`
  if (reason === 'ambiguous') {
    return `Hay varias carreras activas con el nombre "${name}"; corrige el catálogo o usa el nombre exacto.`
  }
  return `No existe la carrera "${name}".`
}

function periodLookupError(name: string, reason: 'unknown' | 'inactive' | 'ambiguous') {
  if (reason === 'inactive') return `El período "${name}" está inactivo.`
  if (reason === 'ambiguous') {
    return `Hay varios períodos activos con el nombre "${name}"; corrige el catálogo o usa el nombre exacto.`
  }
  return `No existe el período "${name}".`
}

/** Escapa los comodines de LIKE para comparar un correo literal con ilike. */
function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`)
}

// ------------------------------------------------------------
// Estudiantes y docentes -- mismo formato de columnas, misma
// logica de creacion (auth.admin.createUser + completar el
// profile), solo cambia la validacion del codigo y el rol final.
// ------------------------------------------------------------

interface UserImportRow {
  firstName: string
  lastName: string
  email: string
  password: string
  code: string
  careerId: string | null
}

const EMAIL_DOMAIN = '@urepublicana.edu.co'

async function bulkImportUsers(
  formData: FormData,
  role: 'STUDENT' | 'PROFESSOR'
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { success: false, error: 'No autorizado.' }

  const parsed = await readFileRows(formData, role)
  if ('error' in parsed) return { success: false, error: parsed.error }

  const admin = getSupabaseAdmin()

  // Las carreras se cargan una sola vez: validar la columna Carrera no
  // debe costar una consulta por fila.
  const { data: careers, error: careersError } = await admin
    .from('careers')
    .select('id, name, is_active')
  if (careersError) return { success: false, error: 'No se pudieron cargar las carreras.' }
  const findCareer = buildNameLookup(careers || [])

  const careerTable = role === 'STUDENT' ? 'student_careers' : 'professor_careers'
  const ownerColumn = role === 'STUDENT' ? 'student_id' : 'professor_id'

  // Repetidos dentro del mismo archivo: con filas en paralelo no se pueden
  // dejar a la restricción de la base (las dos pasarían la revisión previa).
  const seenCodes = new Map<string, number>()
  const seenEmails = new Map<string, number>()

  const result = await runBulkImport<UserImportRow>(
    parsed.rows,
    (row, rowNumber) => {
      const firstName = normalizeName(row['Nombres'] || '')
      const lastName = normalizeName(row['Apellidos'] || '')
      const email = (row['Correo'] || '').trim().toLowerCase()
      const password = (row['Contraseña'] || '').trim()
      const code = (row['Código'] || '').trim()
      const careerName = (row['Carrera'] || '').trim()

      if (isExampleRow(role, row)) return { error: EXAMPLE_ROW_ERROR }
      if (!firstName || !lastName || !email || !password || !code) {
        return { error: 'Faltan datos (Nombres, Apellidos, Correo, Contraseña, Código).' }
      }
      if (password.length < 6) {
        return { error: 'La contraseña debe tener al menos 6 caracteres.' }
      }
      if (role === 'STUDENT' && !/^\d{12}$/.test(code)) {
        return { error: 'El código de estudiante debe tener exactamente 12 dígitos.' }
      }
      if (!email.endsWith(EMAIL_DOMAIN)) {
        return { error: `El correo debe ser institucional (${EMAIL_DOMAIN}).` }
      }

      let careerId: string | null = null
      if (careerName) {
        const match = findCareer(careerName)
        if (!match.ok) return { error: careerLookupError(careerName, match.reason) }
        careerId = match.item.id
      }

      const codeRow = seenCodes.get(code)
      if (codeRow) {
        return {
          error: `El código está repetido en el archivo (también aparece en la fila ${codeRow}).`,
        }
      }
      const emailRow = seenEmails.get(email)
      if (emailRow) {
        return {
          error: `El correo está repetido en el archivo (también aparece en la fila ${emailRow}).`,
        }
      }
      seenCodes.set(code, rowNumber)
      seenEmails.set(email, rowNumber)

      return { data: { firstName, lastName, email, password, code, careerId } }
    },
    async (data) => {
      const { data: existingCode } = await admin
        .from('profiles')
        .select('id')
        .eq('student_code', data.code)
        .maybeSingle()
      if (existingCode) return { success: false, error: 'Ese código ya está registrado.' }

      // Si algo falla después de crear la cuenta de acceso se borra, para no
      // dejar un usuario huérfano que bloquee el correo y el código al reintentar.
      const rollback = async (userId: string, reason: string) => {
        try {
          const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
          if (!deleteError) return { success: false, error: `${reason} No se creó el usuario.` }
          return {
            success: false,
            error: `${reason} Además no se pudo eliminar la cuenta creada (${deleteError.message}); revísala en Usuarios (${data.email}).`,
          }
        } catch {
          return {
            success: false,
            error: `${reason} Además no se pudo eliminar la cuenta creada; revísala en Usuarios (${data.email}).`,
          }
        }
      }

      let userId: string
      try {
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email: data.email,
          password: data.password,
          email_confirm: true,
          user_metadata: {
            first_name: data.firstName,
            last_name: data.lastName,
            student_code: data.code,
          },
        })
        if (createError) {
          const taken =
            createError.code === 'email_exists' || /already.*registered/i.test(createError.message)
          return {
            success: false,
            error: taken ? 'Ya existe un usuario con ese correo.' : createError.message,
          }
        }
        userId = created.user.id
      } catch (err) {
        // createUser pudo crear la cuenta antes de fallar (p. ej. tiempo de espera).
        // Se busca por correo Y código -- el código se verificó libre arriba, así que
        // un perfil con ambos es el nuestro y nunca un usuario previo con ese correo.
        const reason = `Error inesperado al crear la cuenta: ${err instanceof Error ? err.message : 'error desconocido'}.`
        try {
          const { data: orphan } = await admin
            .from('profiles')
            .select('id')
            .eq('email', data.email)
            .eq('student_code', data.code)
            .maybeSingle()
          return orphan ? await rollback(orphan.id, reason) : { success: false, error: reason }
        } catch {
          return {
            success: false,
            error: `${reason} No se pudo comprobar si la cuenta quedó creada; revísala en Usuarios (${data.email}).`,
          }
        }
      }

      try {
        // select('id'): un update que no toca ninguna fila no devuelve error y
        // dejaría un usuario sin rol ni código.
        const { data: updated, error: updateError } = await admin
          .from('profiles')
          .update({ role, student_code: data.code, email: data.email })
          .eq('id', userId)
          .select('id')
        if (updateError) {
          return await rollback(userId, `No se pudo completar el perfil: ${updateError.message}.`)
        }
        if (!updated || updated.length === 0) {
          return await rollback(userId, 'No se encontró el perfil del usuario creado.')
        }

        if (data.careerId) {
          const { error: careerError } = await admin
            .from(careerTable)
            .insert({ [ownerColumn]: userId, career_id: data.careerId, is_active: true })
          if (careerError) {
            return await rollback(userId, `No se pudo asignar la carrera: ${careerError.message}.`)
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'error desconocido'
        return await rollback(userId, `Error inesperado al completar el usuario: ${message}.`)
      }

      return { success: true }
    },
    { rowNumbers: parsed.rowNumbers, concurrency: IMPORT_CONCURRENCY }
  )

  revalidatePath('/admin/users')
  return result
}

export async function bulkImportStudents(formData: FormData) {
  return bulkImportUsers(formData, 'STUDENT')
}

export async function bulkImportProfessors(formData: FormData) {
  return bulkImportUsers(formData, 'PROFESSOR')
}

// ------------------------------------------------------------
// Materias
// ------------------------------------------------------------

interface SubjectImportRow {
  name: string
  code: string
  professorEmail: string
  periodName: string
  careerName: string
  level: number | null
}

export async function bulkImportSubjects(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { success: false, error: 'No autorizado.' }
  const { supabase } = ctx

  const parsed = await readFileRows(formData, 'SUBJECT')
  if ('error' in parsed) return { success: false, error: parsed.error }

  // Carreras y períodos se cargan una sola vez, no una consulta por fila.
  const [{ data: careers, error: careersError }, { data: periods, error: periodsError }] =
    await Promise.all([
      supabase.from('careers').select('id, name, is_active'),
      supabase.from('periods').select('id, name, is_active'),
    ])
  if (careersError || periodsError) {
    return { success: false, error: 'No se pudieron cargar las carreras y los períodos.' }
  }
  const findCareer = buildNameLookup(careers || [])
  const findPeriod = buildNameLookup(periods || [])

  const result = await runBulkImport<SubjectImportRow>(
    parsed.rows,
    (row) => {
      const name = normalizeName(row['Nombre'] || '')
      const code = (row['Código'] || '').trim()
      const professorEmail = (row['Correo Profesor'] || '').trim().toLowerCase()
      const periodName = (row['Período'] || '').trim()
      const careerName = (row['Carrera'] || '').trim()
      const levelRaw = (row['Semestre'] || '').trim()

      if (isExampleRow('SUBJECT', row)) return { error: EXAMPLE_ROW_ERROR }
      if (!name || !code) return { error: 'Nombre y Código son obligatorios.' }
      // Regla A: una materia solo admite profesor si ya pertenece
      // a una carrera -- en la misma fila, para poder crear ambos
      // vínculos atómicamente.
      if (professorEmail && !careerName) {
        return { error: 'Para asignar un profesor la fila debe incluir una Carrera.' }
      }
      let level: number | null = null
      if (levelRaw) {
        const n = Number(levelRaw)
        if (!Number.isInteger(n) || n < 1 || n > 20) {
          return { error: 'Semestre debe ser un número entre 1 y 20.' }
        }
        level = n
      }
      return { data: { name, code, professorEmail, periodName, careerName, level } }
    },
    async (data) => {
      let careerId: string | null = null
      if (data.careerName) {
        const match = findCareer(data.careerName)
        if (!match.ok) {
          return { success: false, error: careerLookupError(data.careerName, match.reason) }
        }
        careerId = match.item.id
      }

      let professorId: string | null = null
      if (data.professorEmail) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, role')
          .ilike('email', escapeLike(data.professorEmail))
          .maybeSingle()
        if (!prof)
          return {
            success: false,
            error: `No existe un profesor con el correo ${data.professorEmail}.`,
          }
        if (prof.role !== 'PROFESSOR') {
          return { success: false, error: `${data.professorEmail} no tiene rol de profesor.` }
        }
        // Regla B: el profesor debe pertenecer a la carrera indicada
        const { data: profCareer } = await supabase
          .from('professor_careers')
          .select('id')
          .eq('professor_id', prof.id)
          .eq('career_id', careerId)
          .eq('is_active', true)
          .maybeSingle()
        if (!profCareer) {
          return {
            success: false,
            error: `${data.professorEmail} no pertenece a la carrera "${data.careerName}".`,
          }
        }
        professorId = prof.id
      }

      let periodId: string | null = null
      if (data.periodName) {
        const match = findPeriod(data.periodName)
        if (!match.ok) {
          return { success: false, error: periodLookupError(data.periodName, match.reason) }
        }
        periodId = match.item.id
      }

      const { data: subject, error } = await supabase
        .from('subjects')
        .insert({
          name: data.name,
          code: data.code,
          professor_id: professorId,
          period_id: periodId,
        })
        .select('id')
        .single()

      if (error) {
        if (error.code === '23505')
          return { success: false, error: 'Ya existe una materia con este código.' }
        return { success: false, error: 'Error al crear la materia.' }
      }

      if (careerId) {
        const { error: scError } = await supabase.from('subject_careers').insert({
          subject_id: subject.id,
          career_id: careerId,
          level: data.level,
          is_active: true,
        })
        if (scError) {
          // Se borra la materia recién creada: si quedara, el reintento chocaría con
          // "Ya existe una materia con este código".
          const { error: deleteError } = await supabase
            .from('subjects')
            .delete()
            .eq('id', subject.id)
          return {
            success: false,
            error: deleteError
              ? `No se pudo vincular la materia a la carrera y tampoco eliminarla; revisa la materia ${data.code}.`
              : 'No se pudo vincular la materia a la carrera. No se creó la materia.',
          }
        }
      }

      return { success: true }
    },
    { rowNumbers: parsed.rowNumbers, concurrency: IMPORT_CONCURRENCY }
  )

  revalidatePath('/admin/subjects')
  return result
}

// ------------------------------------------------------------
// Inscripciones
// ------------------------------------------------------------

interface EnrollmentImportRow {
  // Códigos a probar, en orden: el valor completo y, si es distinto, el código
  // extraído de "CÓDIGO — Nombre" (ver codeCandidates).
  subjectCodes: string[]
  studentCodes: string[]
}

export async function bulkImportEnrollments(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { success: false, error: 'No autorizado.' }
  const { supabase } = ctx

  const parsed = await readFileRows(formData, 'ENROLLMENT')
  if ('error' in parsed) return { success: false, error: parsed.error }

  const result = await runBulkImport<EnrollmentImportRow>(
    parsed.rows,
    (row) => {
      // Las listas desplegables muestran "CÓDIGO — Nombre"; vale eso o el código a secas.
      const subjectCodes = codeCandidates(row['Código Materia'] || '')
      const studentCodes = codeCandidates(row['Código Estudiante'] || '')
      if (isExampleRow('ENROLLMENT', row)) return { error: EXAMPLE_ROW_ERROR }
      if (!subjectCodes[0] || !studentCodes[0]) {
        return { error: 'Código Materia y Código Estudiante son obligatorios.' }
      }
      return { data: { subjectCodes, studentCodes } }
    },
    async (data) => {
      // Se prueba primero el valor completo: un código como "CALC - 101" es válido y
      // cortarlo en el guion lo inscribiría en otra materia ("CALC").
      let subject: { id: string } | null = null
      for (const code of data.subjectCodes) {
        const { data: found } = await supabase
          .from('subjects')
          .select('id')
          .eq('code', code)
          .maybeSingle()
        if (found) {
          subject = found
          break
        }
      }
      const subjectLabel = data.subjectCodes[data.subjectCodes.length - 1]
      if (!subject)
        return { success: false, error: `No existe la materia con código ${subjectLabel}.` }

      let student: { id: string; role: string } | null = null
      for (const code of data.studentCodes) {
        const { data: found } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('student_code', code)
          .maybeSingle()
        if (found) {
          student = found
          break
        }
      }
      const studentLabel = data.studentCodes[data.studentCodes.length - 1]
      if (!student) {
        return { success: false, error: `No existe el estudiante con código ${studentLabel}.` }
      }
      if (student.role !== 'STUDENT') {
        return { success: false, error: `${studentLabel} no corresponde a un estudiante.` }
      }

      const check = await checkStudentEnrollable(supabase, subject.id, student.id)
      if (!check.ok) return { success: false, error: check.error }

      const { error } = await supabase
        .from('enrollments')
        .insert({ subject_id: subject.id, student_id: student.id })

      if (error) {
        if (error.code === '23505')
          return { success: false, error: 'Ese estudiante ya está inscrito en esa materia.' }
        return { success: false, error: 'Error al inscribir al estudiante.' }
      }
      return { success: true }
    },
    { rowNumbers: parsed.rowNumbers, concurrency: IMPORT_CONCURRENCY }
  )

  revalidatePath('/admin/subjects')
  return result
}
