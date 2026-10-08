import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/adminClient'

export const dynamic = 'force-dynamic'

// Chequeo de salud real de la base: hace una consulta minima a Postgres
// y responde 503 si falla. Lo usa el workflow de keepalive, que antes
// pegaba a /login -- pero /login responde 200 aunque la base este caida
// (renderiza con 0 carreras), asi que nunca detectaba la pausa del
// proyecto gratuito de Supabase.
export async function GET() {
  try {
    const { error } = await getSupabaseAdmin()
      .from('careers')
      .select('id', { head: true, count: 'exact' })
      .limit(1)

    if (error) {
      return NextResponse.json({ db: 'error' }, { status: 503 })
    }
    return NextResponse.json({ db: 'ok' })
  } catch {
    return NextResponse.json({ db: 'unreachable' }, { status: 503 })
  }
}
