-- ============================================================
-- MIGRACIÓN 029: suspensión de clase + justificación de omisión
--
-- Dos piezas aditivas e idempotentes, ambas del documento de
-- requisitos de la institución:
--
--   1. RF20 / proceso 6 "Suspensión de clase": cuando no hay condiciones
--      para dictar clase (ej. corte de energía), el profesor o el
--      coordinador la reporta con un motivo obligatorio. El sistema
--      cancela la toma de asistencia, NO genera inasistencias y el
--      evento queda registrado administrativamente.
--
--   2. RF22 "Justificación de omisión": si el profesor no tomó
--      asistencia en el horario establecido, debe dar un motivo a
--      coordinación. La omisión se calcula al leer (horario semanal x
--      período x sesiones existentes); acá solo se persiste la
--      justificación del profesor.
--
-- Compatibilidad con main: el código ya desplegado no conoce estas
-- columnas ni la tabla nueva. Todas las columnas aceptan NULL o tienen
-- default, así que sigue funcionando sin cambios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. sessions: suspensión
-- ------------------------------------------------------------
-- ACOPLAMIENTO CON is_active (importante): una clase suspendida se guarda
-- SIEMPRE con is_active = false. En toda la app is_active = false significa
-- "no cuenta como dictada" (cada conteo de clases dictadas filtra
-- is_active = true), así que la suspensión no genera inasistencias en
-- ningún cálculo existente sin tocarlos uno por uno. Lo que distingue
-- "suspendida" de "archivada" es suspended_at IS NOT NULL. El CHECK
-- sessions_suspended_not_held lo hace cumplir en la base: ni código viejo
-- ni uno nuevo pueden dejar una clase suspendida y dictada a la vez.
--
-- suspended_by es la única FK de sessions hacia profiles, y no existe
-- ningún embed PostgREST desde sessions hacia profiles (ni al revés) en
-- origin/main, así que no genera ambigüedad en ningún select existente
-- (el problema de la migración 022 en attendances).
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS suspended_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspension_reason TEXT;

-- `ADD CONSTRAINT IF NOT EXISTS` no existe en PostgreSQL -- se comprueba
-- pg_constraint a mano para que re-ejecutar la migración no falle.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_suspension_reason_required'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_suspension_reason_required
      CHECK (
        suspended_at IS NULL
        OR (suspension_reason IS NOT NULL AND char_length(suspension_reason) >= 5)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_suspended_not_held'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_suspended_not_held
      CHECK (suspended_at IS NULL OR is_active = false);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. subject_schedules.created_at
-- ------------------------------------------------------------
-- La detección de omisiones no debe marcar semanas anteriores a que
-- existiera el bloque de horario. Las filas que ya existen reciben la
-- fecha de esta migración (default now()): a propósito NO se hace backfill
-- hacia atrás, así el primer despliegue no inunda a los profesores con
-- "clases sin registrar" de meses pasados; la vigilancia empieza desde acá.
ALTER TABLE public.subject_schedules
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- ------------------------------------------------------------
-- 3. class_omissions
-- ------------------------------------------------------------
-- Justificación del profesor por una clase programada de la que no hay
-- ninguna sesión. Una fila por materia y día (hora de Bogotá, ya resuelta
-- por el servidor en class_date).
CREATE TABLE IF NOT EXISTS public.class_omissions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id   UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  class_date   DATE NOT NULL,
  schedule_id  UUID REFERENCES public.subject_schedules(id) ON DELETE SET NULL,
  reason       TEXT NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  submitted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, class_date)
);

CREATE INDEX IF NOT EXISTS class_omissions_class_date_idx
  ON public.class_omissions (class_date);

ALTER TABLE public.class_omissions ENABLE ROW LEVEL SECURITY;

-- Lectura: el profesor dueño de la materia (activo) + ADMIN, mismo patrón
-- que subject_schedules_select (026) y absence_justifications_select (024).
DROP POLICY IF EXISTS class_omissions_select ON public.class_omissions;
CREATE POLICY class_omissions_select ON public.class_omissions
  FOR SELECT USING (
    public.my_role() = 'ADMIN'
    OR (
      public.is_active_self()
      AND EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = class_omissions.subject_id
          AND s.professor_id = auth.uid()
      )
    )
  );

-- A propósito no hay policies de INSERT/UPDATE/DELETE: toda escritura
-- pasa por src/lib/actions/classOmissions.ts con el cliente service-role,
-- después de validar en la app que el día realmente es una omisión
-- (mismo patrón que audit_log 023, absence_justifications 024 y
-- app_settings 027).
--
-- submitted_by es la única FK de class_omissions hacia profiles; los
-- embeds futuros deben fijarla igual con
-- profiles!class_omissions_submitted_by_fkey.
