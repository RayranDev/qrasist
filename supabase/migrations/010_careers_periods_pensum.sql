-- ============================================================
-- MIGRACIÓN: Carreras, períodos académicos y pénsum
--
-- Contexto: se necesita poder ver asistencias por período
-- académico (2026-1, 2026-2...) y organizar las materias por
-- carrera y nivel curricular (pénsum), con materias compartidas
-- entre carreras en niveles distintos. Un estudiante puede
-- pertenecer a varias carreras. Estudiantes homologados/no
-- nivelados pueden cursar materias de niveles distintos al
-- nominal -- por eso "nivel" es metadata organizativa del
-- pénsum, no una regla que restrinja inscripciones.
--
-- Todo con soft delete (is_active), igual que el resto del
-- esquema -- nada se borra físicamente.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Carreras
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.careers (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT NOT NULL,
  code       TEXT UNIQUE NOT NULL,
  is_active  BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- 2. Períodos académicos (2026-1, 2026-2, ...)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.periods (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT UNIQUE NOT NULL,
  start_date  DATE,
  end_date    DATE,
  is_active   BOOLEAN NOT NULL DEFAULT true
);

-- ------------------------------------------------------------
-- 3. subjects gana period_id -- cada materia queda atada al
--    período en que se dicta, igual que ya está atada a un
--    profesor. SET NULL en vez de CASCADE: borrar (desactivar)
--    un período no debe destruir el vínculo de materias viejas.
-- ------------------------------------------------------------
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS period_id UUID REFERENCES public.periods(id) ON DELETE SET NULL;

-- ------------------------------------------------------------
-- 4. Pénsum: materia <-> carrera <-> nivel curricular.
--    Una materia compartida entre carreras puede tener nivel
--    distinto en cada una (ej. Cálculo I = nivel 1 en Sistemas,
--    nivel 2 en Industrial).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subject_careers (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  subject_id  UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  career_id   UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
  level       SMALLINT CHECK (level IS NULL OR level BETWEEN 1 AND 20),
  is_active   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (subject_id, career_id)
);

-- ------------------------------------------------------------
-- 5. Estudiante <-> carrera (un estudiante puede tener varias).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_careers (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  career_id   UUID NOT NULL REFERENCES public.careers(id) ON DELETE CASCADE,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (student_id, career_id)
);

-- ------------------------------------------------------------
-- 6. RLS -- mismo patrón que 006_rls_policies.sql
-- ------------------------------------------------------------
ALTER TABLE public.careers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subject_careers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_careers ENABLE ROW LEVEL SECURITY;

-- Catálogo de lectura abierta (carreras/períodos no son datos
-- sensibles) para cualquier autenticado activo; escritura solo
-- ADMIN.
DROP POLICY IF EXISTS careers_select ON public.careers;
CREATE POLICY careers_select ON public.careers
  FOR SELECT USING (public.is_active_self());

DROP POLICY IF EXISTS careers_admin_write ON public.careers;
CREATE POLICY careers_admin_write ON public.careers
  FOR ALL USING (public.my_role() = 'ADMIN') WITH CHECK (public.my_role() = 'ADMIN');

DROP POLICY IF EXISTS periods_select ON public.periods;
CREATE POLICY periods_select ON public.periods
  FOR SELECT USING (public.is_active_self());

DROP POLICY IF EXISTS periods_admin_write ON public.periods;
CREATE POLICY periods_admin_write ON public.periods
  FOR ALL USING (public.my_role() = 'ADMIN') WITH CHECK (public.my_role() = 'ADMIN');

DROP POLICY IF EXISTS subject_careers_select ON public.subject_careers;
CREATE POLICY subject_careers_select ON public.subject_careers
  FOR SELECT USING (public.is_active_self());

DROP POLICY IF EXISTS subject_careers_admin_write ON public.subject_careers;
CREATE POLICY subject_careers_admin_write ON public.subject_careers
  FOR ALL USING (public.my_role() = 'ADMIN') WITH CHECK (public.my_role() = 'ADMIN');

-- student_careers: ADMIN ve todo, el propio estudiante ve lo
-- suyo, PROFESSOR puede leer (igual que ya puede leer perfiles
-- de STUDENT) para dar contexto en aprobación de inscripciones.
DROP POLICY IF EXISTS student_careers_select ON public.student_careers;
CREATE POLICY student_careers_select ON public.student_careers
  FOR SELECT USING (
    public.my_role() = 'ADMIN'
    OR student_id = auth.uid()
    OR public.my_role() = 'PROFESSOR'
  );

DROP POLICY IF EXISTS student_careers_admin_write ON public.student_careers;
CREATE POLICY student_careers_admin_write ON public.student_careers
  FOR ALL USING (public.my_role() = 'ADMIN') WITH CHECK (public.my_role() = 'ADMIN');
