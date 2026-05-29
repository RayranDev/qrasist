'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = (formData.get('email') as string).trim()
  const password = (formData.get('password') as string).trim()

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    // Si la contraseña es incorrecta, redirigimos con un flag de error (puedes mostrar un toast luego)
    redirect('/login?error=Credenciales+incorrectas')
  }

  // Una vez autenticado, redirigimos a una ruta central que evalúe el rol
  redirect('/dashboard')
}

export async function signup(formData: FormData) {
  const email = (formData.get('email') as string).trim()
  const password = (formData.get('password') as string).trim()
  const name = (formData.get('name') as string || '').trim()
  const studentCode = (formData.get('student_code') as string).trim()

  if (!name) redirect('/login?error=El+nombre+es+obligatorio')
  if (!/^\d{12}$/.test(studentCode)) redirect('/login?error=El+c%C3%B3digo+debe+tener+exactamente+12+d%C3%ADgitos+num%C3%A9ricos')
  if (!email.endsWith('@urepublicana.edu.co')) redirect('/login?error=El+correo+debe+ser+institucional+%40urepublicana.edu.co')

  const supabase = await createClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: name,
        student_code: studentCode,
      }
    }
  })

  if (error) {
    redirect('/login?error=' + encodeURIComponent(error.message))
  }

  // Esperar un poco a que el trigger de Supabase cree el profile
  await new Promise(resolve => setTimeout(resolve, 500))

  // Intentar actualizar la tabla pública con el student_code
  if (data.user) {
    await supabase.from('profiles').update({ student_code: studentCode }).eq('id', data.user.id)
  }

  redirect('/dashboard')
}
