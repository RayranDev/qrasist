import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LocalTime from '@/components/LocalTime'

export const dynamic = 'force-dynamic'

interface AttendanceRecord {
  id: string
  scanned_at: string
  session: {
    id: string
    date: string
    subject: {
      name: string
      code: string
    } | null
  } | null
}

export default async function StudentHistoryPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: attendances } = await supabase
    .from('attendances')
    .select(
      `
      id,
      scanned_at,
      session:sessions (
        id,
        date,
        subject:subjects (
          name,
          code
        )
      )
    `
    )
    .eq('student_id', user.id)
    .order('scanned_at', { ascending: false })

  const records = (attendances || []) as unknown as AttendanceRecord[]

  return (
    <div className="pt-2 flex flex-col">
      <div className="flex items-baseline justify-between mb-4">
        <h1 className="text-lg font-black text-gray-900">Historial</h1>
        <p className="text-xs text-gray-400 font-medium">
          {records.length === 1 ? '1 asistencia' : `${records.length} asistencias`}
        </p>
      </div>

      {records.length > 0 ? (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-50 overflow-hidden">
          {records.map((record) => (
            <div key={record.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-gray-900 truncate">
                  {record.session?.subject?.name}
                </p>
                <p className="text-xs font-mono text-emerald-600">
                  {record.session?.subject?.code}
                </p>
              </div>
              <p className="text-xs text-gray-400 text-right shrink-0">
                <LocalTime date={record.scanned_at} />
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
          <p className="text-gray-500 font-medium text-sm">Aún no tenés asistencias registradas</p>
        </div>
      )}
    </div>
  )
}
