-- ============================================================
-- MIGRACIÓN: Soft Delete — agregar is_active a profiles, subjects y sessions
-- Ejecutar en el SQL Editor de Supabase (una sola vez)
-- ============================================================

-- 1. Agregar is_active a profiles (usuarios)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Agregar is_active a subjects (materias)
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 3. Agregar is_active a sessions (sesiones de clase)
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 4. Índices para consultas filtradas por is_active (mejora performance)
CREATE INDEX IF NOT EXISTS idx_profiles_is_active  ON public.profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_subjects_is_active  ON public.subjects(is_active);
CREATE INDEX IF NOT EXISTS idx_sessions_is_active  ON public.sessions(is_active);

-- Verificación
SELECT 'profiles'  AS tabla, COUNT(*) AS total, SUM(CASE WHEN is_active THEN 1 ELSE 0 END) AS activos FROM public.profiles
UNION ALL
SELECT 'subjects',  COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) FROM public.subjects
UNION ALL
SELECT 'sessions',  COUNT(*), SUM(CASE WHEN is_active THEN 1 ELSE 0 END) FROM public.sessions;
