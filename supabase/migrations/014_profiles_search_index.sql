-- ============================================================
-- MIGRACIÓN: Índices de búsqueda para profiles (nombre / código)
--
-- Contexto: Usuarios (y en particular Estudiantes) va a ganar un
-- buscador por nombre/código -- pensado para el caso real de
-- "llamado de lista", donde el profesor/admin necesita encontrar
-- y verificar rápido a una persona puntual para evitar suplantación.
-- Con pocos usuarios un ILIKE '%texto%' sin índice funciona, pero
-- escanea toda la tabla; a medida que crecen los estudiantes esto
-- se vuelve lento. pg_trgm + índice GIN permite que ILIKE use el
-- índice en vez de un full table scan.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_profiles_name_trgm
  ON public.profiles USING GIN (name gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_profiles_student_code_trgm
  ON public.profiles USING GIN (student_code gin_trgm_ops);
