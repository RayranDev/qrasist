import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CreateCareerForm, CareerList, CreatePeriodForm, PeriodList } from './AcademicComponents'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import AdminHeader from '@/components/admin/AdminHeader'

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
          <AdminHeader
            title="Carreras y Períodos"
            description="Gestiona la estructura académica de la institución"
            activeHref="/admin/academic"
          />

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
