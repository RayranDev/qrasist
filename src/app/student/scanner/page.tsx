import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRScanner from '@/components/qr/QRScanner'
import LocalTime from '@/components/LocalTime'
import RiskBanner from '@/components/student/RiskBanner'
import { getStudentSubjectRisks, filterAtRiskSubjects } from '@/lib/attendance/studentSummaries'

export const dynamic = 'force-dynamic'

interface LastAttendance {
  scanned_at: string
  session: {
    subject: { name: string; code: string } | null
  } | null
}

export default async function StudentScannerPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [{ data: lastAttendance }, risks] = await Promise.all([
    supabase
      .from('attendances')
      .select(
        `
      scanned_at,
      session:sessions (
        subject:subjects ( name, code )
      )
    `
      )
      .eq('student_id', user.id)
      .order('scanned_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    getStudentSubjectRisks(supabase, user.id),
  ])

  const last = lastAttendance as unknown as LastAttendance | null
  const atRiskSubjects = filterAtRiskSubjects(risks)

  return (
    <div className="pt-2">
      <RiskBanner risks={atRiskSubjects} />
      <QRScanner />

      {last?.session?.subject && (
        <p className="text-center text-xs text-gray-400 mt-4">
          Última clase: <span className="font-bold text-gray-600">{last.session.subject.name}</span>
          {' · '}
          <LocalTime date={last.scanned_at} />
        </p>
      )}
    </div>
  )
}
