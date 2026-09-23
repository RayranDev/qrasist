// Applies one SQL migration file to the database in DATABASE_URL
// (read from .env.local), inside a single transaction.
//
// Usage: node scripts/db-apply.mjs supabase/migrations/025_external_admin_profiles.sql
//
// Only files under supabase/migrations/ ending in .sql are accepted, so
// the permission rule that allows this script can't be used to run
// arbitrary SQL. The connection string is never printed.
import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import pg from 'pg'

const arg = process.argv[2]
if (!arg) {
  console.error('Usage: node scripts/db-apply.mjs supabase/migrations/<file>.sql')
  process.exit(1)
}

const migrationsDir = realpathSync(path.resolve('supabase/migrations'))
const file = realpathSync(path.resolve(arg))
if (path.dirname(file) !== migrationsDir || !file.endsWith('.sql')) {
  console.error('Refusing: only .sql files directly under supabase/migrations/ can be applied.')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, '')]
    })
)
if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is missing in .env.local')
  process.exit(1)
}

const sql = readFileSync(file, 'utf8')
const client = new pg.Client({
  connectionString: env.DATABASE_URL,
  ssl: /localhost|127\.0\.0\.1/.test(env.DATABASE_URL) ? false : { rejectUnauthorized: false },
})

await client.connect()
try {
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
  console.log(`Applied ${path.basename(file)}`)
} catch (err) {
  await client.query('ROLLBACK').catch(() => {})
  console.error(`Failed to apply ${path.basename(file)}: ${err.message}`)
  process.exitCode = 1
} finally {
  await client.end()
}
