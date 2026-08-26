-- ============================================================
-- MIGRACIÓN: Profesor <-> carrera, y motivo del cambio
--
-- Contexto: hasta ahora una materia podía tener profesor y
-- estudiantes inscritos sin pertenecer a ninguna carrera, y un
-- profesor podía asignarse a cualquier materia sin relación con
-- su área. Se introduce profesor <-> carrera (un profesor puede
-- pertenecer a varias) para poder exigir, a nivel de aplicación:
--   A. una materia solo admite profesor/inscripciones si ya
--      pertenece a >=1 carrera (subject_careers);
--   B. el profesor asignado a una materia debe pertenecer a
--      >=1 de las carreras de esa materia;
--   C. un estudiante solo puede inscribirse si ya declaró >=1
--      carrera (student_careers);
--   D. la carrera del estudiante debe coincidir con la de la
--      materia -- un estudiante homologado que necesite ver una
--      materia de otra carrera primero se agrega a esa carrera
--      (student_careers ya soporta varias por estudiante).
--
-- Estas 4 reglas se validan en los Server Actions, no aquí --
-- esta migración solo agrega la tabla que faltaba. Igual que el
-- resto del esquema, todo con soft delete (is_active).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.professor_careers (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  professor_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  career_id     UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (professor_id, career_id)
);

ALTER TABLE public.professor_careers ENABLE ROW LEVEL SECURITY;

-- Mismo patrón que student_careers: ADMIN ve todo, el propio
-- profesor ve lo suyo. Solo ADMIN escribe.
DROP POLICY IF EXISTS professor_careers_select ON public.professor_careers;
CREATE POLICY professor_careers_select ON public.professor_careers
  FOR SELECT USING (
    public.my_role() = 'ADMIN'
    OR professor_id = auth.uid()
  );

DROP POLICY IF EXISTS professor_careers_admin_write ON public.professor_careers;
CREATE POLICY professor_careers_admin_write ON public.professor_careers
  FOR ALL USING (public.my_role() = 'ADMIN') WITH CHECK (public.my_role() = 'ADMIN');
