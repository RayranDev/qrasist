import AuthForm from './AuthForm'
import { QrCode } from 'lucide-react'
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
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 mb-5 shadow-inner">
            <QrCode className="w-7 h-7" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">QR-Asist</h1>
          <p className="text-gray-500 mt-2 font-medium">Ingreso a la plataforma académica</p>
        </div>

        <AuthForm error={error} info={info} careers={careers || []} />
      </div>
    </div>
  )
}
