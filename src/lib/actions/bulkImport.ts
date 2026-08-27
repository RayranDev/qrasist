'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { revalidatePath } from 'next/cache'
import { checkAdmin } from './authGuards'
import { normalizeName } from '@/lib/utils/normalizeText'
import { parseWorkbookRows } from '@/lib/excel/parseWorkbook'
import { runBulkImport, type ImportResult } from '@/lib/excel/bulkImport'
import { checkStudentEnrollable } from './enrollmentGuards'

type ActionResult = ImportResult | { success: false; error: string }

async function requireAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user || !(await checkAdmin(supabase, user.id))) return null
  return { supabase, user }
}

async function readFileRows(
  formData: FormData
): Promise<{ rows: Record<string, string>[] } | { error: string }> {
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return { error: 'No se recibió ningún archivo.' }

  let rows: Record<string, string>[]
  try {
    rows = await parseWorkbookRows(file)
  } catch {
    return { error: 'No se pudo leer el archivo. ¿Es un .xlsx válido?' }
  }
  if (rows.length === 0) return { error: 'El archivo no tiene filas para importar.' }
  return { rows }
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
}

async function bulkImportUsers(
  formData: FormData,
  role: 'STUDENT' | 'PROFESSOR'
): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { success: false, error: 'No autorizado.' }

  const parsed = await readFileRows(formData)
  if ('error' in parsed) return { success: false, error: parsed.error }

  const admin = getSupabaseAdmin()

  const result = await runBulkImport<UserImportRow>(
    parsed.rows,
    (row) => {
      const firstName = normalizeName(row['Nombres'] || '')
      const lastName = normalizeName(row['Apellidos'] || '')
      const email = (row['Correo'] || '').trim()
      const password = (row['Contraseña'] || '').trim()
      const code = (row['Código'] || '').trim()

      if (!firstName || !lastName || !email || !password || !code) {
        return { error: 'Faltan datos (Nombres, Apellidos, Correo, Contraseña, Código).' }
      }
      if (password.length < 6) {
        return { error: 'La contraseña debe tener al menos 6 caracteres.' }
      }
      if (role === 'STUDENT' && !/^\d{12}$/.test(code)) {
        return { error: 'El código de estudiante debe tener exactamente 12 dígitos.' }
      }
      if (!email.endsWith('@urepublicana.edu.co')) {
        return { error: 'El correo debe ser institucional (@urepublicana.edu.co).' }
      }
      return { data: { firstName, lastName, email, password, code } }
    },
    async (data) => {
      const { data: existingCode } = await admin
        .from('profiles')
        .select('id')
        .eq('student_code', data.code)
        .maybeSingle()
      if (existingCode) return { success: false, error: 'Ese código ya está registrado.' }

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
      if (createError) return { success: false, error: createError.message }

      const { error: updateError } = await admin
        .from('profiles')
        .update({ role, student_code: data.code, email: data.email })
        .eq('id', created.user.id)
      if (updateError) {
        return { success: false, error: `Usuario creado pero incompleto: ${updateError.message}` }
      }

      return { success: true }
    }
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

  const parsed = await readFileRows(formData)
  if ('error' in parsed) return { success: false, error: parsed.error }

  const result = await runBulkImport<SubjectImportRow>(
    parsed.rows,
    (row) => {
      const name = normalizeName(row['Nombre'] || '')
      const code = (row['Código'] || '').trim()
      const professorEmail = (row['Correo Profesor'] || '').trim()
      const periodName = (row['Período'] || '').trim()
      const careerName = (row['Carrera'] || '').trim()
      const levelRaw = (row['Semestre'] || '').trim()

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
        const { data: career } = await supabase
          .from('careers')
          .select('id')
          .eq('name', data.careerName)
          .maybeSingle()
        if (!career) return { success: false, error: `No existe la carrera "${data.careerName}".` }
        careerId = career.id
      }

      let professorId: string | null = null
      if (data.professorEmail) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('id, role')
          .eq('email', data.professorEmail)
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
        const { data: period } = await supabase
          .from('periods')
          .select('id')
          .eq('name', data.periodName)
          .maybeSingle()
        if (!period) return { success: false, error: `No existe el período "${data.periodName}".` }
        periodId = period.id
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
          return { success: false, error: 'Materia creada, pero no se pudo vincular a la carrera.' }
        }
      }

      return { success: true }
    }
  )

  revalidatePath('/admin/subjects')
  return result
}

// ------------------------------------------------------------
// Inscripciones
// ------------------------------------------------------------

interface EnrollmentImportRow {
  subjectCode: string
  studentCode: string
}

export async function bulkImportEnrollments(formData: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin()
  if (!ctx) return { success: false, error: 'No autorizado.' }
  const { supabase } = ctx

  const parsed = await readFileRows(formData)
  if ('error' in parsed) return { success: false, error: parsed.error }

  const result = await runBulkImport<EnrollmentImportRow>(
    parsed.rows,
    (row) => {
      const subjectCode = (row['Código Materia'] || '').trim()
      const studentCode = (row['Código Estudiante'] || '').trim()
      if (!subjectCode || !studentCode) {
        return { error: 'Código Materia y Código Estudiante son obligatorios.' }
      }
      return { data: { subjectCode, studentCode } }
    },
    async (data) => {
      const { data: subject } = await supabase
        .from('subjects')
        .select('id')
        .eq('code', data.subjectCode)
        .maybeSingle()
      if (!subject)
        return { success: false, error: `No existe la materia con código ${data.subjectCode}.` }

      const { data: student } = await supabase
        .from('profiles')
        .select('id, role')
        .eq('student_code', data.studentCode)
        .maybeSingle()
      if (!student)
        return { success: false, error: `No existe el estudiante con código ${data.studentCode}.` }
      if (student.role !== 'STUDENT') {
        return { success: false, error: `${data.studentCode} no corresponde a un estudiante.` }
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
    }
  )

  revalidatePath('/admin/subjects')
  return result
}
