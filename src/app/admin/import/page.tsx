import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ImportPanel from './ImportPanel'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function AdminImportPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Carga Masiva</h1>
              <p className="text-gray-500 mt-1">
                Importa estudiantes, docentes, materias e inscripciones desde Excel
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <Link
                href="/admin/dashboard"
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition"
              >
                Dashboard
              </Link>
              <form action="/auth/signout" method="post">
                <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                  Cerrar Sesión
                </button>
              </form>
            </div>
          </header>

          <ImportPanel />
        </div>
      </div>
    </div>
  )
}
