import { defineConfig, devices } from '@playwright/test'
import { getLocalSupabaseEnv } from './e2e/utils/supabaseLocal'

// The dev server (and every server action / API route it runs) needs
// the LOCAL Supabase URL/keys, never the shared/production ones in
// .env.local (see AGENTS.md for this phase: that project must never
// be touched by this suite). We read them fresh from `supabase
// status` and inject them straight into the webServer's environment,
// which Next.js will use as-is -- environment variables that already
// exist are never overwritten by .env files.
function localSupabaseWebServerEnv() {
  try {
    const env = getLocalSupabaseEnv()
    return {
      NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    }
  } catch (err) {
    throw new Error(
      'No se pudo leer el stack local de Supabase para levantar el server de e2e. ' +
        'Corré `npx supabase start` (y `npx supabase db reset` + el seed) antes de `npm run e2e`.\n' +
        String(err)
    )
  }
}

const STUDENT_SPEC_PATTERN = /03-student/

export default defineConfig({
  testDir: './e2e',
  // The suite shares one local Postgres instance across specs (no
  // per-test transaction rollback), and a couple of specs are
  // intentionally sequential (03 submits a justification, 04 reviews
  // it) -- numbered filenames plus a single worker keep that story
  // deterministic instead of racing on shared rows.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: STUDENT_SPEC_PATTERN,
    },
    {
      name: 'mobile',
      // Chromium only (per phase constraints), just with a phone
      // viewport/touch profile -- devices['Pixel 5'] is chromium-based.
      use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } },
      testMatch: STUDENT_SPEC_PATTERN,
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: localSupabaseWebServerEnv(),
  },
})
