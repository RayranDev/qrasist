-- ============================================================
-- MIGRACION: Profesor desactivado no puede aprobar/rechazar
-- solicitudes de inscripcion
--
-- enrollment_requests_professor_update (011) dejaba pasar a
-- cualquier profesor dueño de la materia sin chequear si su cuenta
-- seguia activa. La rama ADMIN de esa misma policy ya era segura
-- porque my_role() (006) devuelve NULL para cuentas is_active =
-- false -- pero la rama de profesor comparaba professor_id =
-- auth.uid() directo, sin pasar por my_role() ni por
-- is_active_self().
--
-- Como deleteUserAccount (admin.ts) solo hace is_active = false
-- (no invalida el JWT), un profesor desactivado conservaba su
-- sesion y podia seguir aprobando/rechazando solicitudes de sus
-- materias contra esta policy.
-- ============================================================

DROP POLICY IF EXISTS enrollment_requests_professor_update ON public.enrollment_requests;
CREATE POLICY enrollment_requests_professor_update ON public.enrollment_requests
  FOR UPDATE USING (
    public.my_role() = 'ADMIN'
    OR (
      public.is_active_self()
      AND EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = enrollment_requests.subject_id AND s.professor_id = auth.uid()
      )
    )
  );
