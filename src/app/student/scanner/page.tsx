import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import QRScanner from '@/components/qr/QRScanner'

export default async function StudentScannerPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col">
      <div className="flex-1 p-6 max-w-md mx-auto w-full flex flex-col">
        <header className="flex justify-between items-center mb-8 pt-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Escanear Asistencia</h1>
            <p className="text-gray-500 mt-1 text-sm">Apunta la cámara al código QR del profesor</p>
          </div>
          <Link href="/student/history" className="p-2 bg-indigo-50 text-indigo-600 rounded-full hover:bg-indigo-100 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </Link>
        </header>

        <div className="flex-1 flex flex-col justify-center">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <QRScanner />
          </div>
        </div>

        <div className="mt-8 pb-8">
           <form action="/auth/signout" method="post" className="text-center">
            <button className="px-6 py-3 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition w-full">
              Cerrar Sesión
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
