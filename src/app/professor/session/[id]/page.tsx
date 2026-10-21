import { requireRole } from '@/lib/auth/requireRole'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'
import { redirect } from 'next/navigation'
import QRDisplay from '@/components/qr/QRDisplay'
import SessionRosterPanel from '@/components/attendance/SessionRosterPanel'
import BackLink from '@/components/BackLink'
import SuspendClassButton from '@/components/attendance/SuspendClassButton'
import { Badge } from '@/components/ui/Badge'
import { Ban } from 'lucide-react'
import { getAppSettings } from '@/lib/settings/appSettings'
import { canProfessorEditSession } from '@/lib/sessions/classWindow'

export const dynamic = 'force-dynamic'

// Fila de la sesión sin los tokens QR (esos se leen aparte con service-role).
interface SessionRow {
  id: string
  subject_id: string
  date: string
  duration_minutes: number
  expires_at: string
  is_active: boolean | null
  qr_rotation_seconds: number
  class_ends_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  subject: { name: string; professor_id: string } | null
}

export default async function ProfessorSessionPage({
  params,
}: {
  params: Promise<{ id: string }> | { id: string }
}) {
  const resolvedParams = await params
  const sessionId = resolvedParams.id

  const { supabase, user } = await requireRole(['PROFESSOR'])

  // Fetch session details
  const { data: session } = await supabase
    .from('sessions')
    // Columnas explícitas: desde la migración 031 un SELECT * falla para el
    // JWT del usuario porque qr_token / previous_qr_token no son legibles.
    .select(
      'id, subject_id, date, duration_minutes, expires_at, is_active, qr_rotation_seconds, class_ends_at, suspended_at, suspension_reason, subject:subjects(name, professor_id)'
    )
    .eq('id', sessionId)
    .single<SessionRow>()

  if (!session) {
    return <div className="p-8 text-center">Sesión no encontrada</div>
  }

  // Solo el profesor dueño de la materia puede ver el QR en vivo de
  // su sesion -- antes cualquier usuario autenticado que conociera
  // el id de la sesion podia entrar a esta pagina.
  if (session.subject?.professor_id !== user.id) {
    redirect('/professor/subjects')
  }

  // El token vigente solo se lee con service-role, y recién ahora que se
  // comprobó que el profesor es el dueño de la materia.
  const { data: tokenRow } = await getSupabaseAdmin()
    .from('sessions')
    .select('qr_token')
    .eq('id', session.id)
    .single()

  const isSuspended = !!session.suspended_at
  // RF20: suspender solo mientras la clase sigue en curso (misma ventana
  // que corregir asistencia); la server action lo vuelve a validar.
  const { defaultClassMinutes } = await getAppSettings(supabase)
  const canSuspend =
    !isSuspended &&
    session.is_active !== false &&
    canProfessorEditSession(session, defaultClassMinutes)

  return (
    <div className="min-h-screen bg-surface">
      <div className="p-4 md:p-8">
        <div className="max-w-6xl mx-auto">
          <header className="flex justify-between items-start gap-4 flex-wrap mb-8 md:mb-12">
            <div>
              <BackLink href="/professor/subjects">Volver a Materias</BackLink>
              <h1 className="text-2xl md:text-3xl font-black text-gray-900 tracking-tight">
                Código de Asistencia
              </h1>
              <p className="text-gray-500 mt-1">Materia: {session.subject?.name}</p>
              <p className="text-gray-400 text-sm mt-0.5">
                Los estudiantes tienen {session.duration_minutes}{' '}
                {session.duration_minutes === 1 ? 'minuto' : 'minutos'} para registrarse.
              </p>
            </div>
            {canSuspend && <SuspendClassButton sessionId={session.id} />}
          </header>

          {isSuspended && (
            <div
              role="status"
              className="mb-6 max-w-xl bg-white rounded-2xl border border-red-200/80 p-5 flex gap-3"
            >
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0 border border-red-100">
                <Ban className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-sm font-bold text-gray-900">Clase suspendida</h2>
                  <Badge variant="danger" size="sm">
                    Suspendida
                  </Badge>
                </div>
                <p className="text-sm text-gray-600 wrap-break-word">{session.suspension_reason}</p>
                <p className="text-xs text-gray-400 mt-2">
                  No se toma asistencia y no se generan inasistencias. Coordinación puede deshacer
                  la suspensión si fue un error.
                </p>
              </div>
            </div>
          )}

          {/* Panel lateral en desktop para no achicar el QR proyectado;
              apilado debajo en mobile. */}
          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {!isSuspended && (
              <div className="lg:flex-1 lg:max-w-xl">
                <QRDisplay
                  sessionId={session.id}
                  qrToken={tokenRow?.qr_token ?? null}
                  expiresAt={session.expires_at}
                  rotationSeconds={session.qr_rotation_seconds}
                />
              </div>
            )}
            <div className="lg:w-96 lg:shrink-0">
              <SessionRosterPanel sessionId={session.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
