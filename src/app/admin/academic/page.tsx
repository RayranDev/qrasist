import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CreateCareerForm, CareerList, CreatePeriodForm, PeriodList } from './AcademicComponents'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function AdminAcademicPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: careers } = await supabase
    .from('careers')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name')

  const { data: periods } = await supabase
    .from('periods')
    .select('*')
    .order('is_active', { ascending: false })
    .order('name', { ascending: false })

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-5xl mx-auto">
          <header className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Carreras y Períodos</h1>
              <p className="text-gray-500 mt-1">
                Gestiona la estructura académica de la institución
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <Link
                href="/admin/dashboard"
                className="text-sm font-medium text-gray-500 hover:text-gray-900 transition"
              >
                Dashboard
              </Link>
              <Link
                href="/admin/subjects"
                className="text-sm font-medium text-gray-600 hover:text-gray-900 transition"
              >
                Ver Materias
              </Link>
              <form action="/auth/signout" method="post">
                <button className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition">
                  Cerrar Sesión
                </button>
              </form>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <CreateCareerForm />
              <CareerList careers={careers || []} />
            </div>
            <div>
              <CreatePeriodForm />
              <PeriodList periods={periods || []} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
