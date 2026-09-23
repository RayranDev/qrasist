import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { requestPasswordReset } from './actions'

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>
}) {
  const { error, info } = await searchParams

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
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Recuperar contraseña</h1>
          <p className="text-gray-500 mt-2 font-medium text-sm">
            Ingresá tu correo y te enviamos un enlace para restablecerla.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200/80 text-red-700 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
            {error}
          </div>
        )}
        {info && !error && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200/80 text-emerald-800 rounded-xl text-xs font-semibold shadow-xs animate-in fade-in duration-200">
            {info}
          </div>
        )}

        <form action={requestPasswordReset} className="space-y-4">
          <Input
            required
            name="email"
            type="email"
            label="Correo Institucional"
            placeholder="usuario@urepublicana.edu.co"
          />

          <Button type="submit" variant="primary" size="lg" className="w-full mt-2">
            Enviar enlace
          </Button>
        </form>

        <p className="text-center mt-8">
          <Link
            href="/login"
            className="text-xs text-navy-700 font-bold hover:text-navy-900 hover:underline transition"
          >
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </div>
  )
}
