import Image from 'next/image'
import AuthForm from './AuthForm'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; info?: string }>
}) {
  const { error, info } = await searchParams

  // El visitante no está autenticado todavía, así que no puede pasar
  // por la RLS normal de "careers" (exige sesión activa) -- se lee
  // con el cliente de servicio porque el catálogo de carreras no es
  // información sensible y el formulario de registro lo necesita.
  const admin = getSupabaseAdmin()
  const { data: careers } = await admin
    .from('careers')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

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
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">QR-Asist</h1>
          <p className="text-gray-500 mt-2 font-medium">Control de asistencia académica</p>
        </div>

        <AuthForm error={error} info={info} careers={careers || []} />

        <p className="text-center text-[11px] text-gray-400 mt-8 italic">
          &ldquo;Formamos más colombianos ética, social y científicamente&rdquo;
        </p>
      </div>
    </div>
  )
}
