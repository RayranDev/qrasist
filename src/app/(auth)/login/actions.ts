'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { redirect } from 'next/navigation'
import { normalizeName } from '@/lib/utils/normalizeText'
import { loginSchema, signupSchema } from '@/lib/validations/schemas'

export async function login(formData: FormData) {
  const email = ((formData.get('email') as string) || '').trim()
  const password = ((formData.get('password') as string) || '').trim()

  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) {
    redirect(
      '/login?error=' + encodeURIComponent(parsed.error.issues[0]?.message || 'Datos inválidos')
    )
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) {
    redirect('/login?error=Credenciales+incorrectas')
  }

  // Antifraude: una sola sesión activa por cuenta
  if (data.session) {
    try {
      const admin = getSupabaseAdmin()
      await admin.auth.admin.signOut(data.session.access_token, 'others')
    } catch {
      // no bloquear el login por esto
    }
  }

  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const rawData = {
    firstName: normalizeName((formData.get('first_name') as string) || ''),
    lastName: normalizeName((formData.get('last_name') as string) || ''),
    studentCode: ((formData.get('student_code') as string) || '').trim(),
    careerId: ((formData.get('career_id') as string) || '').trim(),
    email: ((formData.get('email') as string) || '').trim(),
    password: ((formData.get('password') as string) || '').trim(),
  }

  const parsed = signupSchema.safeParse(rawData)
  if (!parsed.success) {
    redirect(
      '/login?error=' + encodeURIComponent(parsed.error.issues[0]?.message || 'Datos inválidos')
    )
  }

  // Validamos el id de la carrera contra la base de datos
  const admin = getSupabaseAdmin()
  const { data: career } = await admin
    .from('careers')
    .select('id')
    .eq('id', parsed.data.careerId)
    .eq('is_active', true)
    .maybeSingle()

  if (!career) {
    redirect('/login?error=La+carrera+seleccionada+no+es+v%C3%A1lida')
  }

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        first_name: parsed.data.firstName,
        last_name: parsed.data.lastName,
        student_code: parsed.data.studentCode,
      },
    },
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  // Esperar a que el trigger de Supabase cree el profile
  await new Promise((resolve) => setTimeout(resolve, 500))

  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ student_code: parsed.data.studentCode })
      .eq('id', data.user.id)

    if (profileError) {
      redirect(
        '/login?error=' +
          encodeURIComponent(
            'Tu cuenta se creó pero el código estudiantil no se guardó. Contacta al administrador.'
          )
      )
    }

    const { error: careerError } = await admin
      .from('student_careers')
      .insert({ student_id: data.user.id, career_id: parsed.data.careerId, is_active: true })

    if (careerError) {
      redirect(
        '/login?error=' +
          encodeURIComponent(
            'Tu cuenta se creó pero no se pudo guardar tu carrera. Contacta al administrador.'
          )
      )
    }
  }

  redirect('/dashboard')
}
