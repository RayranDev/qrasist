/**
 * Reads connection info for the LOCAL Supabase stack started with
 * `npx supabase start`.
 *
 * We deliberately never read `.env.local` (that file points at the
 * shared/production project per AGENTS.md for this phase) and we
 * never hardcode the local anon/service keys as a fallback: they are
 * derived fresh from `supabase status` every time, which also acts as
 * a guard -- if the local stack isn't running, this throws instead of
 * silently handing back stale or wrong credentials.
 *
 * `supabase status -o env` prints shell-style `KEY="VALUE"` lines (not
 * JSON, despite the flag name) plus the occasional informational line
 * on stdout (e.g. "Stopped services: [...]"), so we only parse lines
 * that actually look like `KEY="VALUE"`.
 */
import { execSync } from 'node:child_process'

export interface LocalSupabaseEnv {
  NEXT_PUBLIC_SUPABASE_URL: string
  NEXT_PUBLIC_SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  SUPABASE_DB_URL: string
}

let cached: LocalSupabaseEnv | null = null

export function getLocalSupabaseEnv(): LocalSupabaseEnv {
  if (cached) return cached

  const raw = execSync('npx supabase status -o env', {
    encoding: 'utf8',
    cwd: process.cwd(),
  })

  const values: Record<string, string> = {}
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)="(.*)"$/)
    if (match) values[match[1]] = match[2]
  }

  const apiUrl = values.API_URL
  const anonKey = values.ANON_KEY
  const serviceRoleKey = values.SERVICE_ROLE_KEY
  const dbUrl = values.DB_URL

  if (!apiUrl || !anonKey || !serviceRoleKey || !dbUrl) {
    throw new Error(
      'No se pudo leer la configuración del stack local de Supabase. ' +
        '¿Corriste `npx supabase start` antes de esto? Salida recibida:\n' +
        raw
    )
  }

  // Hard guard shared by every caller (seed script and specs that write
  // with the service role): refuse anything that isn't a local stack,
  // even if a future change adds another source for these values.
  for (const url of [apiUrl, dbUrl]) {
    if (!/^[a-z]+:\/\/([^@/]*@)?(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url)) {
      throw new Error(`Refusing to run E2E against a non-local Supabase URL: ${new URL(url).host}`)
    }
  }

  cached = {
    NEXT_PUBLIC_SUPABASE_URL: apiUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    SUPABASE_DB_URL: dbUrl,
  }
  return cached
}
