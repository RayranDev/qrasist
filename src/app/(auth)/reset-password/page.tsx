import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ResetPasswordForm from './ResetPasswordForm'

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Esta página solo tiene sentido con la sesión de recuperación que
  // crea /auth/confirm al validar el enlace del correo -- sin sesión no
  // hay nada que actualizar.
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 border-t-4 border-t-brand-700 p-8 md:p-10">
        <div className="text-center mb-8">
          <Image
            src="/brand/escudo.png"
            alt="Escudo de la Corporación Universitaria Republicana"
            width={72}
            height={72}
            className="mx-auto mb-4 object-contain"
            priority
          />
          <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-1">
            Corporación Universitaria Republicana
          </p>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Nueva contraseña</h1>
          <p className="text-gray-500 mt-2 font-medium text-sm">
            Elegí una nueva contraseña para tu cuenta.
          </p>
        </div>

        <ResetPasswordForm />
      </div>
    </div>
  )
}
