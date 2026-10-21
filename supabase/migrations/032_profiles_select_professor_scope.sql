-- ============================================================
-- MIGRACIÓN 032: un profesor solo ve perfiles de SUS estudiantes
--                (DEF-QA-02)
--
-- ORDEN DE DESPLIEGUE: independiente del código y de 031. El código de la
-- rama no cambia qué perfiles lee cada pantalla del profesor (todas parten
-- de materias propias), así que puede aplicarse antes o después del
-- despliegue. Es restrictiva: aplicarla junto con 031, después de desplegar.
--
-- Problema: profiles_select (006) dejaba a cualquier PROFESSOR leer TODOS
-- los perfiles con role = 'STUDENT' (nombre, correo, código) llamando a
-- PostgREST con su JWT, aunque el estudiante no tuviera relación con sus
-- materias.
--
-- Ahora un profesor activo ve:
--   - su propio perfil (id = auth.uid(), sin cambio);
--   - los estudiantes que tienen relación con alguna de SUS materias:
--       * inscritos (enrollments),
--       * con solicitud de inscripción (enrollment_requests),
--       * con justificaciones de inasistencia (absence_justifications),
--       * con asistencias registradas (attendances; cubre a los invitados
--         que escanearon sin estar inscritos).
-- ADMIN sigue viendo todo y cada usuario su propio perfil.
--
-- La relación se evalúa en una función SECURITY DEFINER: consulta
-- subjects / enrollments / etc. sin volver a disparar sus políticas RLS, lo
-- que evita la recursión infinita entre políticas que ya ocurrió con
-- sessions_select (ver 016). Mismo patrón que my_role() e is_active_self().
-- ============================================================

CREATE OR REPLACE FUNCTION public.professor_can_view_student(p_student_id UUID)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subjects su
    WHERE su.professor_id = auth.uid()
      AND (
        EXISTS (
          SELECT 1 FROM public.enrollments e
          WHERE e.subject_id = su.id AND e.student_id = p_student_id
        )
        OR EXISTS (
          SELECT 1 FROM public.enrollment_requests r
          WHERE r.subject_id = su.id AND r.student_id = p_student_id
        )
        OR EXISTS (
          SELECT 1 FROM public.absence_justifications j
          WHERE j.subject_id = su.id AND j.student_id = p_student_id
        )
        OR EXISTS (
          SELECT 1 FROM public.attendances a
          WHERE a.subject_id = su.id AND a.student_id = p_student_id
        )
      )
  )
$$;

-- EXECUTE queda para PUBLIC (como my_role() e is_active_self()): Postgres
-- exige ese privilegio al rol que evalúa la política, incluido anon, y sin
-- él una consulta anónima a profiles fallaría con 42501 en vez de no
-- devolver filas. Sin auth.uid() la función devuelve false.

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.my_role() = 'ADMIN'
    OR (
      public.my_role() = 'PROFESSOR'
      AND role = 'STUDENT'
      AND public.professor_can_view_student(id)
    )
  );
