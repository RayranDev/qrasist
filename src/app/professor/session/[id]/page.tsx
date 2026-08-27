import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QRDisplay from '@/components/qr/QRDisplay'
import BackLink from '@/components/BackLink'

export const dynamic = 'force-dynamic'

export default async function ProfessorSessionPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await params
  const sessionId = resolvedParams.id

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch session details
  const { data: session } = await supabase
    .from('sessions')
    .select('*, subject:subjects(name, professor_id)')
    .eq('id', sessionId)
    .single()

  if (!session) {
    return <div className="p-8 text-center">Sesión no encontrada</div>
  }

  // Solo el profesor dueño de la materia puede ver el QR en vivo de
  // su sesion -- antes cualquier usuario autenticado que conociera
  // el id de la sesion podia entrar a esta pagina.
  if (session.subject?.professor_id !== user.id) {
    redirect('/professor/subjects')
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <header className="flex justify-between items-center mb-8 md:mb-12">
            <div>
              <BackLink href="/professor/subjects">Volver a Materias</BackLink>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Código de Asistencia
              </h1>
              <p className="text-gray-500 mt-1">Materia: {session.subject?.name}</p>
            </div>
          </header>

          <QRDisplay
            sessionId={session.id}
            qrToken={session.qr_token}
            expiresAt={session.expires_at}
          />
        </div>
      </div>
    </div>
  )
}
