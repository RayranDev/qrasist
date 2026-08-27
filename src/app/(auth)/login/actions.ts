'use server'

import { createClient } from '@/lib/supabase/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { redirect } from 'next/navigation'
import { normalizeName } from '@/lib/utils/normalizeText'

export async function login(formData: FormData) {
  const email = ((formData.get('email') as string) || '').trim()
  const password = ((formData.get('password') as string) || '').trim()

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Si la contraseña es incorrecta, redirigimos con un flag de error (puedes mostrar un toast luego)
    redirect('/login?error=Credenciales+incorrectas')
  }

  // Antifraude: una sola sesion activa por cuenta. Al loguearse en
  // un dispositivo nuevo, se cierran todas las demas sesiones de
  // esta cuenta -- si dos personas comparten credenciales, la
  // segunda saca a la primera en vez de poder registrar asistencia
  // "como ella" desde otro dispositivo al mismo tiempo. No falla el
  // login si esto no se puede hacer (ej. admin key no disponible),
  // solo se omite el cierre de otras sesiones.
  if (data.session) {
    try {
      const admin = getSupabaseAdmin()
      await admin.auth.admin.signOut(data.session.access_token, 'others')
    } catch {
      // no bloquear el login por esto
    }
  }

  // Una vez autenticado, redirigimos a una ruta central que evalúe el rol
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const email = ((formData.get('email') as string) || '').trim()
  const password = ((formData.get('password') as string) || '').trim()
  const firstName = normalizeName((formData.get('first_name') as string) || '')
  const lastName = normalizeName((formData.get('last_name') as string) || '')
  const studentCode = ((formData.get('student_code') as string) || '').trim()
  const careerId = ((formData.get('career_id') as string) || '').trim()

  if (!firstName || !lastName) redirect('/login?error=Nombre+y+apellido+son+obligatorios')
  if (!/^\d{12}$/.test(studentCode))
    redirect('/login?error=El+c%C3%B3digo+debe+tener+exactamente+12+d%C3%ADgitos+num%C3%A9ricos')
  if (!email.endsWith('@urepublicana.edu.co'))
    redirect('/login?error=El+correo+debe+ser+institucional+%40urepublicana.edu.co')
  if (!careerId) redirect('/login?error=Selecciona+tu+carrera')

  // Regla de negocio: hasta que el estudiante no tenga una carrera
  // no puede inscribirse a ninguna materia (ver enrollmentGuards.ts).
  // Validamos el id contra el catalogo real -- el select viene del
  // cliente, no confiamos en que sea una carrera activa de verdad.
  const admin = getSupabaseAdmin()
  const { data: career } = await admin
    .from('careers')
    .select('id')
    .eq('id', careerId)
    .eq('is_active', true)
    .maybeSingle()
  if (!career) redirect('/login?error=La+carrera+seleccionada+no+es+v%C3%A1lida')

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        student_code: studentCode,
      },
    },
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  // Esperar un poco a que el trigger de Supabase cree el profile
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Intentar actualizar la tabla pública con el student_code
  if (data.user) {
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ student_code: studentCode })
      .eq('id', data.user.id)
    if (profileError) {
      redirect(
        '/login?error=' +
          encodeURIComponent(
            'Tu cuenta se creó pero el código estudiantil no se guardó. Contacta al administrador.'
          )
      )
    }

    // student_careers solo admite escritura de ADMIN por RLS (ver
    // 010_careers_periods_pensum.sql) -- el propio registro no puede
    // insertar su fila, asi que se hace con el cliente de servicio.
    // El student_id sale del usuario recien creado, no de un input
    // del cliente, asi que no hay escalamiento de privilegios.
    const { error: careerError } = await admin
      .from('student_careers')
      .insert({ student_id: data.user.id, career_id: careerId, is_active: true })
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
