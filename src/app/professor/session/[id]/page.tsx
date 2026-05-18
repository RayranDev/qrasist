import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRDisplay from '@/components/qr/QRDisplay'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function ProfessorSessionPage({ params }: { params: Promise<{ id: string }> | { id: string } }) {
  const resolvedParams = await params
  const sessionId = resolvedParams.id

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch session details
  const { data: session } = await supabase
    .from('sessions')
    .select('*, subject:subjects(name)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return <div className="p-8 text-center">Sesión no encontrada</div>
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] p-8">
      <div className="max-w-4xl mx-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <Link href="/professor/subjects" className="text-indigo-600 hover:text-indigo-700 font-medium text-sm flex items-center gap-1 mb-2">
              ← Volver a Materias
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Código de Asistencia</h1>
            <p className="text-gray-500 mt-1">Materia: {session.subject?.name}</p>
          </div>
        </header>

        <QRDisplay qrToken={session.qr_token} expiresAt={session.expires_at} />
      </div>
    </div>
  )
}
