'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function login(formData: FormData) {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

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
