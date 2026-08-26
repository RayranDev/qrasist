-- ============================================================
-- MIGRACIÓN: Constraint real de "una asistencia por materia
-- por día" (regla de negocio #4 de DOCUMENTACION_TECNICA.md).
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
--
-- Problema: hoy el único candado de la base es
-- UNIQUE(session_id, student_id). Si existen dos sesiones
-- distintas de la misma materia el mismo día, un estudiante
-- puede registrar asistencia en ambas -- el chequeo que lo
-- evita hoy vive en código (attendance.ts) como un SELECT
-- antes del INSERT, lo cual no es atómico: dos requests
-- concurrentes pueden pasar el SELECT antes de que cualquiera
-- inserte.
--
-- Solución: denormalizar subject_id en attendances (vía
-- trigger, se completa solo) y crear un índice único real
-- sobre (student_id, subject_id, día).
-- ============================================================

-- 1. Columna denormalizada. No se llena a mano: el trigger de
--    abajo la completa a partir de sessions.subject_id en cada
--    INSERT.
ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS subject_id UUID REFERENCES public.subjects(id);

-- 2. Backfill de filas históricas (no rompe nada si ya corrió).
UPDATE public.attendances a
SET subject_id = s.subject_id
FROM public.sessions s
WHERE a.session_id = s.id AND a.subject_id IS NULL;

-- 3. Trigger que completa subject_id en cada INSERT nuevo.
CREATE OR REPLACE FUNCTION public.set_attendance_subject_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT subject_id INTO NEW.subject_id FROM public.sessions WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_attendance_subject_id ON public.attendances;
CREATE TRIGGER trg_set_attendance_subject_id
  BEFORE INSERT ON public.attendances
  FOR EACH ROW EXECUTE FUNCTION public.set_attendance_subject_id();

-- 4. El candado real: un estudiante no puede tener dos filas de
--    attendances para la misma materia el mismo día calendario,
--    sin importar cuántas sesiones distintas existan ese día.
--
--    scanned_at::date no sirve directo en un índice: ese cast
--    depende del TimeZone de la sesión (STABLE, no IMMUTABLE) y
--    Postgres lo rechaza. Se envuelve en una función IMMUTABLE
--    que fija el día en hora de Colombia (America/Bogota) --
--    la zona real de la institución -- para que una clase de
--    las 7pm no quede contada como "el día siguiente" por usar
--    UTC.
CREATE OR REPLACE FUNCTION public.attendance_day(ts TIMESTAMPTZ)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (ts AT TIME ZONE 'America/Bogota')::date
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_attendance_per_subject_per_day
  ON public.attendances (student_id, subject_id, public.attendance_day(scanned_at));
