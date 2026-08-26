import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AssignSubjectForm, PensumByLevel } from './PensumManager'
import MobileWarningBanner from '@/components/MobileWarningBanner'

export const dynamic = 'force-dynamic'

export default async function CareerPensumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: careerId } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: career } = await supabase.from('careers').select('*').eq('id', careerId).single()
  if (!career) redirect('/admin/academic')

  const { data: pensumEntries } = await supabase
    .from('subject_careers')
    .select('id, level, subject:subjects(id, name, code, period:periods(name))')
    .eq('career_id', careerId)
    .eq('is_active', true)
    .order('level')

  const { data: allSubjects } = await supabase
    .from('subjects')
    .select('id, name, code')
    .eq('is_active', true)
    .order('name')

  interface PensumEntryRow {
    id: string
    level: number | null
    subject: { id: string; name: string; code: string; period: { name: string } | null } | null
  }
  const entries = (pensumEntries || []) as unknown as PensumEntryRow[]

  const assignedSubjectIds = new Set(entries.map((e) => e.subject?.id))
  const availableSubjects = (allSubjects || []).filter((s) => !assignedSubjectIds.has(s.id))

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <Link
              href="/admin/academic"
              className="text-emerald-600 hover:text-emerald-700 font-medium text-sm flex items-center gap-1 mb-2"
            >
              ← Volver a Carreras
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Pénsum: {career.name}</h1>
            <p className="text-gray-500 mt-1 font-mono text-sm">{career.code}</p>
          </header>

          <AssignSubjectForm careerId={careerId} availableSubjects={availableSubjects} />
          <PensumByLevel
            careerId={careerId}
            entries={
              entries.filter((e) => e.subject !== null) as {
                id: string
                level: number | null
                subject: { id: string; name: string; code: string; period: { name: string } | null }
              }[]
            }
          />
        </div>
      </div>
    </div>
  )
}
