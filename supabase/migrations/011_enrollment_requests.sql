-- ============================================================
-- MIGRACIÓN: Solicitud de inscripción por código
--
-- Contexto: hoy solo el ADMIN inscribe estudiantes en materias
-- (EnrollmentManager). Se pide un flujo alternativo: el docente
-- genera un código para su materia, el estudiante lo usa para
-- SOLICITAR inscripción (no queda inscrito automático), y el
-- docente aprueba o rechaza. Util para homologados/no nivelados
-- que necesitan una materia puntual sin depender del admin.
--
-- Deliberado: se usa una tabla separada (enrollment_requests) en
-- vez de agregarle un "status" a enrollments. enrollments hoy
-- significa "ya inscrito de verdad" en toda la app (attendance.ts,
-- dashboard, HistoryDrillDown, EnrollmentManager) -- cambiar su
-- semantica hubiera obligado a tocar y re-verificar cada uno de
-- esos lugares. Con una tabla nueva, ese codigo existente queda
-- intacto: la aprobacion simplemente termina insertando una fila
-- en enrollments como ya lo hace el admin hoy.
-- ============================================================

-- 1. Código de inscripción por materia (uno a la vez, el docente
--    lo puede regenerar si se filtró).
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS enrollment_code TEXT UNIQUE;

-- 2. Solicitudes de inscripción.
CREATE TABLE IF NOT EXISTS public.enrollment_requests (
  id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id   UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at  TIMESTAMPTZ,
  reviewed_by  UUID REFERENCES public.profiles(id),
  UNIQUE (student_id, subject_id)
);

ALTER TABLE public.enrollment_requests ENABLE ROW LEVEL SECURITY;

-- Estudiante: ve y crea sus propias solicitudes.
DROP POLICY IF EXISTS enrollment_requests_student_select ON public.enrollment_requests;
CREATE POLICY enrollment_requests_student_select ON public.enrollment_requests
  FOR SELECT USING (
    student_id = auth.uid()
    OR public.my_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = enrollment_requests.subject_id AND s.professor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS enrollment_requests_student_insert ON public.enrollment_requests;
CREATE POLICY enrollment_requests_student_insert ON public.enrollment_requests
  FOR INSERT WITH CHECK (public.my_role() = 'STUDENT' AND student_id = auth.uid());

-- Profesor dueño de la materia (o ADMIN): puede aprobar/rechazar.
DROP POLICY IF EXISTS enrollment_requests_professor_update ON public.enrollment_requests;
CREATE POLICY enrollment_requests_professor_update ON public.enrollment_requests
  FOR UPDATE USING (
    public.my_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = enrollment_requests.subject_id AND s.professor_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- 3. El docente necesita poder escribir enrollment_code en su
--    propia materia -- hoy subjects_admin_write (006) solo deja
--    escribir a ADMIN. Se agrega una policy para que el
--    PROFESSOR dueño pueda actualizar su fila, pero un trigger
--    (mismo patron que protect_profile_privileged_columns en
--    006) bloquea que toque cualquier columna que no sea
--    enrollment_code -- nombre, código, profesor asignado,
--    período y is_active siguen siendo exclusivos de ADMIN.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS subjects_professor_update_own ON public.subjects;
CREATE POLICY subjects_professor_update_own ON public.subjects
  FOR UPDATE
  USING (public.my_role() = 'PROFESSOR' AND professor_id = auth.uid())
  WITH CHECK (public.my_role() = 'PROFESSOR' AND professor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_subject_admin_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.my_role() IS DISTINCT FROM 'ADMIN' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
      OR NEW.code IS DISTINCT FROM OLD.code
      OR NEW.professor_id IS DISTINCT FROM OLD.professor_id
      OR NEW.period_id IS DISTINCT FROM OLD.period_id
      OR NEW.is_active IS DISTINCT FROM OLD.is_active
    THEN
      RAISE EXCEPTION 'Solo un ADMIN puede modificar nombre, código, profesor, período o estado de una materia';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_subject_admin_columns ON public.subjects;
CREATE TRIGGER trg_protect_subject_admin_columns
  BEFORE UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.protect_subject_admin_columns();

-- ------------------------------------------------------------
-- 4. Al aprobar una solicitud, la accion del docente inserta en
--    enrollments -- hoy enrollments_admin_write (006) solo deja
--    insertar a ADMIN. Se agrega permiso al PROFESSOR dueño de
--    la materia, unicamente para insertar (no puede leer/borrar
--    inscripciones ajenas via esta policy, eso lo sigue cubriendo
--    enrollments_select de 006).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS enrollments_professor_insert_own ON public.enrollments;
CREATE POLICY enrollments_professor_insert_own ON public.enrollments
  FOR INSERT
  WITH CHECK (
    public.my_role() = 'PROFESSOR'
    AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = enrollments.subject_id AND s.professor_id = auth.uid())
  );
