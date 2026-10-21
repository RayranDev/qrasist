import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Cron diario de mantenimiento (vercel.json). Hace limpieza real y unas
 * cuantas lecturas, lo que ademas genera la actividad diaria que Supabase
 * exige para no pausar un proyecto del plan gratuito ("unas pocas consultas
 * por dia durante la semana"). Un ping de una sola consulta cada 2 dias no
 * alcanzo: el proyecto se pauso igual. Mismo patron que el proyecto de la
 * escuela de futbol, que nunca se pauso.
 *
 * Protegido por CRON_SECRET (Vercel Cron envia `Authorization: Bearer
 * ${CRON_SECRET}`). Idempotente.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new NextResponse(null, { status: 401 })
  }

  const admin = getSupabaseAdmin()
  const now = new Date()

  try {
    // Ventanas de rate limit vencidas: la funcion check_rate_limit solo las
    // borra con 1% de probabilidad, asi que se acumulan.
    const { count: rateLimitsDeleted, error: deleteError } = await admin
      .from('rate_limits')
      .delete({ count: 'exact' })
      .lt('window_start', new Date(now.getTime() - DAY_MS).toISOString())
    if (deleteError) throw deleteError

    const [activeSessions, pendingJustifications, activeSubjects] = await Promise.all([
      admin
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gt('expires_at', now.toISOString()),
      admin
        .from('absence_justifications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'PENDING'),
      admin.from('subjects').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])
    const readError = activeSessions.error || pendingJustifications.error || activeSubjects.error
    if (readError) throw readError

    return NextResponse.json({
      ok: true,
      rateLimitsDeleted: rateLimitsDeleted ?? 0,
      openSessions: activeSessions.count ?? 0,
      pendingJustifications: pendingJustifications.count ?? 0,
      activeSubjects: activeSubjects.count ?? 0,
    })
  } catch (error) {
    console.error('[cron/maintenance]', error)
    return NextResponse.json({ ok: false }, { status: 503 })
  }
}
