-- ============================================================
-- MIGRACIÓN: Row Level Security (RLS) para profiles, subjects,
-- enrollments, sessions y attendances.
-- Ejecutar en el SQL Editor de Supabase (una sola vez).
--
-- Contexto: ninguna de las migraciones anteriores habilitó RLS.
-- Hoy cualquier usuario autenticado -- e incluso el rol "anon"
-- sin sesión -- puede leer y escribir estas tablas directamente
-- contra la API de PostgREST, sin pasar por los Server Actions
-- de Next.js. Esta migración cierra ese acceso y replica en la
-- base de datos las mismas reglas de rol que ya existen en el
-- código (defensa en profundidad).
-- ============================================================

-- ------------------------------------------------------------
-- 0. Funciones auxiliares (SECURITY DEFINER evita la recursión
--    de RLS al consultar profiles desde dentro de una política
--    sobre la propia tabla profiles).
-- ------------------------------------------------------------

-- Rol del usuario autenticado, SOLO si su cuenta está activa.
-- Si is_active = false, devuelve NULL y por lo tanto todas las
-- políticas que comparan "my_role() = 'ADMIN' / 'PROFESSOR'"
-- fallan automáticamente: un usuario desactivado pierde sus
-- permisos de rol en toda la base, no solo en /dashboard.
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active = true
$$;

-- true si el usuario autenticado existe y está activo. Se usa
-- para las políticas de "dueño de su propio dato" (student_id =
-- auth.uid()), que no pasan por my_role().
CREATE OR REPLACE FUNCTION public.is_active_self()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = auth.uid()), false)
$$;

-- ------------------------------------------------------------
-- 1. Habilitar RLS
-- ------------------------------------------------------------
ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------
-- 2. profiles
--    - Cualquiera lee su propio perfil (incluso desactivado:
--      así el dashboard puede detectarlo y hacer signOut).
--    - ADMIN lee todos los perfiles.
--    - PROFESSOR lee perfiles de STUDENT (nombre/código para
--      historial de asistencia y listados).
--    - Update: uno mismo, o ADMIN sobre cualquier perfil. El
--      trigger de la sección 7 impide que alguien que no sea
--      ADMIN cambie su propio "role" o "is_active".
-- ------------------------------------------------------------
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT
  USING (
    id = auth.uid()
    OR public.my_role() = 'ADMIN'
    OR (public.my_role() = 'PROFESSOR' AND role = 'STUDENT')
  );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  FOR UPDATE
  USING (id = auth.uid() OR public.my_role() = 'ADMIN')
  WITH CHECK (id = auth.uid() OR public.my_role() = 'ADMIN');

-- No se define policy de INSERT: los perfiles nacen únicamente
-- por el trigger handle_new_user (SECURITY DEFINER), que corre
-- con privilegios del owner y no queda sujeto a estas políticas.

-- ------------------------------------------------------------
-- 3. subjects
--    - Lectura abierta a cualquier autenticado activo: el
--      nombre/código de materia no es dato sensible y lo
--      necesitan estudiantes invitados que escanean sin estar
--      inscritos.
--    - Solo ADMIN crea/edita/archiva materias.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS subjects_select ON public.subjects;
CREATE POLICY subjects_select ON public.subjects
  FOR SELECT
  USING (public.is_active_self());

DROP POLICY IF EXISTS subjects_admin_write ON public.subjects;
CREATE POLICY subjects_admin_write ON public.subjects
  FOR ALL
  USING (public.my_role() = 'ADMIN')
  WITH CHECK (public.my_role() = 'ADMIN');

-- ------------------------------------------------------------
-- 4. enrollments
--    - ADMIN: control total (inscribir/quitar estudiantes).
--    - PROFESSOR: lee las inscripciones de SUS materias.
--    - STUDENT: lee sus propias inscripciones.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS enrollments_select ON public.enrollments;
CREATE POLICY enrollments_select ON public.enrollments
  FOR SELECT
  USING (
    public.my_role() = 'ADMIN'
    OR student_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.subjects s
      WHERE s.id = enrollments.subject_id AND s.professor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS enrollments_admin_write ON public.enrollments;
CREATE POLICY enrollments_admin_write ON public.enrollments
  FOR ALL
  USING (public.my_role() = 'ADMIN')
  WITH CHECK (public.my_role() = 'ADMIN');

-- ------------------------------------------------------------
-- 5. sessions
--    - Lectura abierta a cualquier autenticado activo (ver
--      nota de diseño: el qr_token sigue siendo el secreto real,
--      igual que hoy; esto solo bloquea acceso anónimo).
--    - INSERT/UPDATE (crear QR, archivar/reactivar): solo el
--      PROFESSOR dueño de la materia.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS sessions_select ON public.sessions;
CREATE POLICY sessions_select ON public.sessions
  FOR SELECT
  USING (public.is_active_self());

DROP POLICY IF EXISTS sessions_professor_write ON public.sessions;
CREATE POLICY sessions_professor_write ON public.sessions
  FOR ALL
  USING (
    public.my_role() = 'PROFESSOR'
    AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = sessions.subject_id AND s.professor_id = auth.uid())
  )
  WITH CHECK (
    public.my_role() = 'PROFESSOR'
    AND EXISTS (SELECT 1 FROM public.subjects s WHERE s.id = sessions.subject_id AND s.professor_id = auth.uid())
  );

-- ------------------------------------------------------------
-- 6. attendances
--    - INSERT: solo un STUDENT activo, registrando SU propia
--      asistencia (student_id = auth.uid()). No se valida acá
--      si está inscrito -- esa lógica de "invitado" vive en
--      registerAttendance() y sigue funcionando igual.
--      my_role() = 'STUDENT' excluye a ADMIN/PROFESSOR: sin esto,
--      cualquier cuenta autenticada podía insertarse asistencia a
--      sí misma saltando por completo registerAttendance().
--    - SELECT: uno mismo, el PROFESSOR dueño de la sesión, o
--      ADMIN.
--    - Sin UPDATE/DELETE: son registros inmutables.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS attendances_select ON public.attendances;
CREATE POLICY attendances_select ON public.attendances
  FOR SELECT
  USING (
    student_id = auth.uid()
    OR public.my_role() = 'ADMIN'
    OR EXISTS (
      SELECT 1 FROM public.sessions se
      JOIN public.subjects su ON su.id = se.subject_id
      WHERE se.id = attendances.session_id AND su.professor_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS attendances_insert ON public.attendances;
CREATE POLICY attendances_insert ON public.attendances
  FOR INSERT
  WITH CHECK (public.my_role() = 'STUDENT' AND student_id = auth.uid());

-- ------------------------------------------------------------
-- 7. Trigger anti-escalada de privilegios en profiles.
--    RLS trabaja por fila, no por columna: sin este trigger,
--    un STUDENT autenticado podría hacer
--    `update profiles set role='ADMIN' where id=auth.uid()`
--    directo contra la API y la policy profiles_update (que
--    solo exige id = auth.uid()) lo dejaría pasar.
--    Si quien actualiza es ADMIN, no se restringe nada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.my_role() IS DISTINCT FROM 'ADMIN' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Solo un ADMIN puede cambiar el rol de un usuario';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Solo un ADMIN puede activar/desactivar usuarios';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_privileged_columns();

-- ------------------------------------------------------------
-- 8. Verificación: relrowsecurity debe ser 't' en las 5 tablas.
-- ------------------------------------------------------------
SELECT relname AS tabla, relrowsecurity AS rls_activo
FROM pg_class
WHERE relname IN ('profiles', 'subjects', 'enrollments', 'sessions', 'attendances')
  AND relnamespace = 'public'::regnamespace;
