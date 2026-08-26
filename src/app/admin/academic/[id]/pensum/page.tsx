import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AssignSubjectForm, PensumByLevel } from './PensumManager'
import MobileWarningBanner from '@/components/MobileWarningBanner'
import BackLink from '@/components/BackLink'

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

  const { count: studentCount } = await supabase
    .from('student_careers')
    .select('*', { count: 'exact', head: true })
    .eq('career_id', careerId)
    .eq('is_active', true)

  return (
    <div className="min-h-screen bg-surface">
      <MobileWarningBanner />
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <BackLink href="/admin/academic">Volver a Carreras</BackLink>
            <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
              Pénsum: {career.name}
            </h1>
            <p className="text-gray-500 mt-1 font-mono text-sm mb-4">{career.code}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/admin/users?role=STUDENT&career=${careerId}`}
                className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-sm font-bold hover:bg-emerald-100 transition"
              >
                {studentCount ?? 0} estudiante{(studentCount ?? 0) !== 1 ? 's' : ''}
              </Link>
              <span className="px-4 py-2 bg-sky-50 text-sky-700 rounded-xl text-sm font-bold">
                {entries.length} materia{entries.length !== 1 ? 's' : ''} en el pénsum
              </span>
            </div>
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
