'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { checkStudentEnrollable } from './enrollmentGuards'

// Alfabeto sin caracteres ambiguos (0/O, 1/I/L) para que el
// estudiante lo pueda transcribir sin confundirse.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

function generateCode(length = 7) {
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]
  }
  return code
}

export async function generateEnrollmentCode(subjectId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado.' }

  const { data: subject } = await supabase
    .from('subjects')
    .select('id')
    .eq('id', subjectId)
    .eq('professor_id', user.id)
    .single()

  if (!subject) return { success: false, error: 'Materia no encontrada o acceso denegado.' }

  // Reintenta si el codigo generado ya existe (colision improbable
  // con 7 caracteres de un alfabeto de 32, pero el UNIQUE lo exige).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode()
    const { error } = await supabase
      .from('subjects')
      .update({ enrollment_code: code })
      .eq('id', subjectId)

    if (!error) {
      revalidatePath('/professor/subjects')
      return { success: true, code }
    }
    if (error.code !== '23505') {
      return { success: false, error: 'No se pudo generar el código.' }
    }
  }

  return { success: false, error: 'No se pudo generar un código único. Intenta de nuevo.' }
}

export async function requestEnrollment(rawCode: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No estás autenticado.' }

  const code = rawCode.trim().toUpperCase()
  if (!code) return { success: false, error: 'Ingresa un código.' }

  const { data: subject, error: subjectError } = await supabase
    .from('subjects')
    .select('id, name, code, is_active')
    .eq('enrollment_code', code)
    .single()

  if (subjectError || !subject) {
    return { success: false, error: 'Código inválido. Verifica con tu docente.' }
  }
  if (subject.is_active === false) {
    return { success: false, error: 'Esta materia está archivada y no acepta solicitudes.' }
  }

  const { data: existingEnrollment } = await supabase
    .from('enrollments')
    .select('id')
    .eq('subject_id', subject.id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existingEnrollment) {
    return { success: false, error: `Ya estás inscrito en ${subject.name}.` }
  }

  const { data: existingRequest } = await supabase
    .from('enrollment_requests')
    .select('id, status')
    .eq('subject_id', subject.id)
    .eq('student_id', user.id)
    .maybeSingle()

  if (existingRequest?.status === 'pending') {
    return { success: false, error: `Ya tienes una solicitud pendiente para ${subject.name}.` }
  }

  const check = await checkStudentEnrollable(supabase, subject.id, user.id)
  if (!check.ok) return { success: false, error: check.error }

  const { error } = await supabase.from('enrollment_requests').upsert(
    {
      student_id: user.id,
      subject_id: subject.id,
      status: 'pending',
      requested_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
    },
    { onConflict: 'student_id,subject_id' }
  )

  if (error) return { success: false, error: 'No se pudo enviar la solicitud.' }

  revalidatePath('/student/scanner')
  return { success: true, subjectName: subject.name, subjectCode: subject.code }
}

export async function approveEnrollmentRequest(requestId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado.' }

  const { data: request } = await supabase
    .from('enrollment_requests')
    .select('id, student_id, subject_id, status')
    .eq('id', requestId)
    .single()

  if (!request) return { success: false, error: 'Solicitud no encontrada.' }
  if (request.status !== 'pending') {
    return { success: false, error: 'Esta solicitud ya fue procesada.' }
  }

  // Revalidar por si algo cambio desde que se hizo la solicitud
  // (ej. un admin quito la carrera del estudiante o de la materia).
  const check = await checkStudentEnrollable(supabase, request.subject_id, request.student_id)
  if (!check.ok) return { success: false, error: check.error }

  const { error: enrollError } = await supabase
    .from('enrollments')
    .insert({ subject_id: request.subject_id, student_id: request.student_id })

  // 23505 = ya estaba inscrito por otra via -- no es un error real aca.
  if (enrollError && enrollError.code !== '23505') {
    return { success: false, error: 'No se pudo aprobar la solicitud.' }
  }

  const { error: updateError } = await supabase
    .from('enrollment_requests')
    .update({ status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', requestId)

  if (updateError) return { success: false, error: 'No se pudo actualizar la solicitud.' }

  revalidatePath('/professor/subjects')
  return { success: true }
}

export async function rejectEnrollmentRequest(requestId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autenticado.' }

  const { error } = await supabase
    .from('enrollment_requests')
    .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user.id })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return { success: false, error: 'No se pudo rechazar la solicitud.' }

  revalidatePath('/professor/subjects')
  return { success: true }
}
