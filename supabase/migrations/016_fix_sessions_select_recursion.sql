-- ============================================================
-- MIGRACIÓN: Corrige recursión infinita en sessions_select
--
-- La politica sessions_select de 015 referenciaba attendances
-- (EXISTS ... FROM attendances), y attendances_select (006) a su vez
-- referencia sessions (EXISTS ... FROM sessions JOIN subjects) --
-- Postgres detecta la recursion al evaluar RLS de una en terminos de
-- la otra: "infinite recursion detected in policy for relation
-- sessions" (42P17), que rompio createSession() para cualquier
-- profesor real en cuanto se aplico 015.
--
-- Mismo patron ya usado en este esquema (my_role(), is_active_self()):
-- una funcion SECURITY DEFINER corre con privilegios que no vuelven a
-- disparar la RLS de la tabla que consulta por dentro, cortando el
-- ciclo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.has_attendance_for_session(p_session_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.attendances
    WHERE session_id = p_session_id AND student_id = auth.uid()
  )
$$;

DROP POLICY IF EXISTS sessions_select ON public.sessions;
CREATE POLICY sessions_select ON public.sessions
  FOR SELECT
  USING (
    public.is_active_self()
    AND (
      public.my_role() = 'ADMIN'
      OR EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = sessions.subject_id AND s.professor_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.subject_id = sessions.subject_id AND e.student_id = auth.uid()
      )
      OR public.has_attendance_for_session(sessions.id)
    )
  );
