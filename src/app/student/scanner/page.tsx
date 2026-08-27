import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRScanner from '@/components/qr/QRScanner'
import LocalTime from '@/components/LocalTime'

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

  const { data: lastAttendance } = await supabase
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
    .maybeSingle()

  const last = lastAttendance as unknown as LastAttendance | null

  return (
    <div className="pt-2">
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
