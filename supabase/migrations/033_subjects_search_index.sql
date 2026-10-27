-- Trigram indexes so the admin subject search (ILIKE '%term%' on name or code)
-- does not degrade into a sequential scan as the catalogue grows.
-- pg_trgm is already enabled by 014; repeated defensively so this file is
-- self-contained.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_subjects_name_trgm
  ON public.subjects USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_subjects_code_trgm
  ON public.subjects USING GIN (code gin_trgm_ops);
