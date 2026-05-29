import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRScanner from '@/components/qr/QRScanner'
import LocalTime from '@/components/LocalTime'

export const dynamic = 'force-dynamic'

export default async function StudentScannerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, student_code')
    .eq('id', user.id)
    .single()

  const { data: recentAttendances } = await supabase
    .from('attendances')
    .select(`
      id,
      scanned_at,
      session:sessions (
        subject:subjects ( name, code )
      )
    `)
    .eq('student_id', user.id)
    .order('scanned_at', { ascending: false })
    .limit(5)

  const firstName = profile?.name?.split(' ')[0] || 'Estudiante'

  return (
    <div className="min-h-screen bg-[#F7F7F5] flex flex-col">
      <div className="flex-1 p-5 max-w-md mx-auto w-full flex flex-col gap-6">

        {/* Header */}
        <header className="flex justify-between items-center pt-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600">Portal Estudiante</p>
            <h1 className="text-xl font-black text-gray-900">Hola, {firstName} 👋</h1>
            {profile?.student_code && (
              <p className="text-xs text-gray-400 font-mono mt-0.5">Cód. {profile.student_code}</p>
            )}
          </div>
          <form action="/auth/signout" method="post">
            <button className="px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition">
              Salir
            </button>
          </form>
        </header>

        {/* Scanner */}
        <section>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Escanear QR</p>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <QRScanner />
          </div>
        </section>

        {/* Historial reciente */}
        <section className="pb-6">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Últimas Asistencias</p>
            <a href="/student/history" className="text-xs font-bold text-emerald-600 hover:text-emerald-700 transition">
              Ver todo →
            </a>
          </div>
          {recentAttendances && recentAttendances.length > 0 ? (
            <div className="space-y-2.5">
              {recentAttendances.map((record: any) => (
                <div key={record.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                    <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 truncate">{record.session?.subject?.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <span className="font-mono text-emerald-600">{record.session?.subject?.code}</span>
                      <span>·</span>
                      <LocalTime date={record.scanned_at} />
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 p-6 text-center shadow-sm">
              <p className="text-sm text-gray-400 font-medium">Aún no tienes asistencias registradas.</p>
              <p className="text-xs text-gray-400 mt-1">Escanea el QR de tu profe para comenzar.</p>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
