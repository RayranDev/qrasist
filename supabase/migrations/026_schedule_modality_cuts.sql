-- ============================================================
-- MIGRACIÓN: Cortes por período, horario semanal de materias y
--            modalidad/reposición de sesiones
--
-- Tres piezas nuevas, independientes entre sí:
--
--   1. period_cuts: cortes (parciales) de un período académico, ej.
--      "Primer corte" 2026-02-01..2026-03-15. Viven a nivel de
--      PERÍODO (no de materia) porque todas las materias de un
--      período comparten el mismo calendario académico. Son
--      puramente informativos: agrupan sesiones/asistencia para
--      mostrar un desglose por corte (ver src/lib/attendance/
--      cutsBreakdown.ts), pero NUNCA alimentan computeAttendanceSummary
--      -- el veredicto NORMAL/WARNING/FAILED_ATTENDANCE sigue siendo
--      semestral y vive exclusivamente en esa función.
--
--   2. subject_schedules: bloques semanales recurrentes de una
--      materia (día de la semana, horario, modalidad). Permite que
--      "Calcular sesiones planificadas" derive total_planned_sessions
--      de bloques x semanas del período en vez de ser un número
--      adivinado a mano (igual sigue siendo editable después).
--
--   3. sessions gana modality/is_makeup/makeup_reason: una sesión
--      puntual puede ser de una modalidad distinta a la habitual de
--      la materia (ej. una reposición virtual de una clase
--      presencial), y queda registrado el motivo cuando es reposición.
--
-- Ninguna de las dos tablas nuevas referencia `profiles`, así que no
-- generan ambigüedad en ningún embed existente de profiles (el
-- problema de la migración 022 en attendances). Se verificó además
-- que origin/main no tiene ningún embed PostgREST hacia period_cuts
-- ni subject_schedules (no podría tenerlo: son tablas nuevas).
-- ============================================================

-- ------------------------------------------------------------
-- 1. period_cuts
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.period_cuts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id  UUID NOT NULL REFERENCES public.periods(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  sequence   SMALLINT NOT NULL,
  CHECK (start_date <= end_date),
  UNIQUE (period_id, sequence)
);

CREATE INDEX IF NOT EXISTS period_cuts_period_id_idx ON public.period_cuts (period_id);

ALTER TABLE public.period_cuts ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a cualquier autenticado activo: todos necesitan ver
-- el desglose por corte de su propia asistencia (estudiante), de su
-- materia (profesor) o de la institución (admin). Mismo criterio que
-- careers/periods en la migración 010.
DROP POLICY IF EXISTS period_cuts_select ON public.period_cuts;
CREATE POLICY period_cuts_select ON public.period_cuts
  FOR SELECT USING (public.is_active_self());

-- A propósito no hay policies de INSERT/UPDATE/DELETE: mismo patrón
-- que audit_log (023) / absence_justifications (024). Todas las
-- escrituras pasan por src/lib/actions/periodCuts.ts con el cliente
-- service-role, después de checkAdmin().

-- ------------------------------------------------------------
-- 2. subject_schedules
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_schedules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  TIME NOT NULL,
  end_time    TIME NOT NULL,
  modality    TEXT NOT NULL CHECK (modality IN ('PRESENCIAL', 'VIRTUAL')),
  CHECK (start_time < end_time)
);

CREATE INDEX IF NOT EXISTS subject_schedules_subject_id_idx ON public.subject_schedules (subject_id);

ALTER TABLE public.subject_schedules ENABLE ROW LEVEL SECURITY;

-- Lectura: el profesor dueño de la materia (activo) + ADMIN, mismo
-- patrón de ownership que absence_justifications_select (024).
DROP POLICY IF EXISTS subject_schedules_select ON public.subject_schedules;
CREATE POLICY subject_schedules_select ON public.subject_schedules
  FOR SELECT USING (
    public.my_role() = 'ADMIN'
    OR (
      public.is_active_self()
      AND EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = subject_schedules.subject_id
          AND s.professor_id = auth.uid()
      )
    )
  );

-- A propósito no hay policies de INSERT/UPDATE/DELETE: todas las
-- escrituras pasan por src/lib/actions/adminSubjects.ts con el
-- cliente service-role, después de checkAdmin() -- hoy el horario solo
-- lo gestiona el admin (no hay UI de autogestión para el profesor);
-- el SELECT de arriba sí deja leer al profesor dueño, para cuando
-- la UI se extienda.

-- ------------------------------------------------------------
-- 3. sessions: modalidad + reposición
-- ------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS modality TEXT
    CHECK (modality IS NULL OR modality IN ('PRESENCIAL', 'VIRTUAL')),
  ADD COLUMN IF NOT EXISTS is_makeup BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS makeup_reason TEXT;

-- `ADD CONSTRAINT IF NOT EXISTS` no existe en PostgreSQL -- se
-- comprueba pg_constraint a mano para que la migración siga siendo
-- idempotente (re-ejecutarla no debe fallar con "constraint already
-- exists").
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_makeup_reason_required'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_makeup_reason_required
      CHECK (NOT is_makeup OR makeup_reason IS NOT NULL);
  END IF;
END $$;
