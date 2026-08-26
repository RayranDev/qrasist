import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LocalTime from '@/components/LocalTime'
import BackLink from '@/components/BackLink'
import { Check, Clock } from 'lucide-react'

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

  // Fetch attendances with related session and subject data
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

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col">
        <header className="flex justify-between items-center mb-6 pt-4">
          <div>
            <BackLink href="/student/scanner">Volver al Inicio</BackLink>
            <h1 className="text-xl font-black text-gray-900">Mi Historial</h1>
            <p className="text-gray-500 mt-1 text-sm">Registro de tus clases asistidas</p>
          </div>
        </header>

        <div className="flex-1">
          {attendances && attendances.length > 0 ? (
            <div className="space-y-4">
              {(attendances as unknown as AttendanceRecord[]).map((record) => (
                <div
                  key={record.id}
                  className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4"
                >
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 shrink-0">
                    <Check className="w-6 h-6" strokeWidth={2} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{record.session?.subject?.name}</h3>
                    <p className="text-xs text-emerald-600 font-medium mb-1">
                      {record.session?.subject?.code}
                    </p>
                    <p className="text-xs text-gray-500 capitalize">
                      <LocalTime date={record.scanned_at} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <Clock className="w-8 h-8" strokeWidth={2} />
              </div>
              <p className="text-gray-500 font-medium">Aún no tienes asistencias registradas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
