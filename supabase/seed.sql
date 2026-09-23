-- ============================================================
-- Local dev/test seed (runs after every `supabase db reset`).
--
-- Only infra that must exist before the app can be used locally
-- goes here (storage buckets). Deterministic test users/data for
-- the Playwright E2E suite are created by e2e/seed/seed.ts, which
-- needs the Auth Admin API (service role) and can't be done in
-- plain SQL for auth.users without hand-rolling password hashes.
-- ============================================================

-- Private bucket for absence_justifications attachments (see
-- migration 024). Idempotent: ON CONFLICT DO NOTHING so re-running
-- `db reset` never fails on a second insert.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'justifications',
  'justifications',
  false,
  5242880, -- 5 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg']
)
ON CONFLICT (id) DO NOTHING;
