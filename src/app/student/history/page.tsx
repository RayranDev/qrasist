import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export const dynamic = 'force-dynamic'

export default async function StudentHistoryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch attendances with related session and subject data
  const { data: attendances } = await supabase
    .from('attendances')
    .select(`
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
    `)
    .eq('student_id', user.id)
    .order('scanned_at', { ascending: false })

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <div className="flex-1 p-6 max-w-md mx-auto w-full flex flex-col">
        <header className="flex justify-between items-center mb-8 pt-4">
          <div>
            <Link href="/student/scanner" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm flex items-center gap-1 mb-2">
              ← Volver al Escáner
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">Mi Historial</h1>
            <p className="text-gray-500 mt-1 text-sm">Registro de tus clases asistidas</p>
          </div>
        </header>

        <div className="flex-1">
          {attendances && attendances.length > 0 ? (
            <div className="space-y-4">
              {attendances.map((record: any) => (
                <div key={record.id} className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-500 flex-shrink-0">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{record.session?.subject?.name}</h3>
                    <p className="text-xs text-indigo-600 font-medium mb-1">{record.session?.subject?.code}</p>
                    <p className="text-xs text-gray-500">
                      {format(new Date(record.scanned_at), "EEEE d 'de' MMMM, h:mm a", { locale: es })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4 text-gray-400">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-gray-500 font-medium">Aún no tienes asistencias registradas</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
