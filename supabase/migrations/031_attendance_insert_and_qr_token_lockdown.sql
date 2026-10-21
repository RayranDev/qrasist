-- ============================================================
-- MIGRACIÓN 031: cierra el INSERT directo de asistencias y la lectura
--                de los tokens QR por parte de usuarios (DEF-QA-01)
--
-- !! ORDEN DE DESPLIEGUE (importante) !!
--
--   1. Desplegar PRIMERO el código de la rama fix/attendance-insert-security.
--      A partir de ahí:
--        - registerAttendance inserta en `attendances` con service-role,
--          después de todas sus validaciones;
--        - la página del QR del profesor y refreshSessionQrToken leen
--          qr_token con service-role (tras comprobar que es el dueño);
--        - ninguna consulta con el JWT del usuario usa SELECT * ni pide
--          qr_token / previous_qr_token de `sessions`.
--   2. Aplicar ESTA migración (031) DESPUÉS del despliegue.
--
-- NO aplicar 031 antes del despliegue: el código anterior inserta la
-- asistencia con el JWT del estudiante (necesita attendances_insert) y la
-- página del QR del profesor lee qr_token con su JWT (necesita el SELECT
-- de columnas que acá se quita). Sin el código nuevo, tomar asistencia y
-- mostrar el QR fallarían hasta desplegar.
--
-- Por qué se hace:
--
--   a) attendances_insert (006): WITH CHECK (my_role() = 'STUDENT' AND
--      student_id = auth.uid()). Con su propio JWT contra PostgREST (la
--      anon key es pública) cualquier estudiante podía insertarse una
--      asistencia sin QR, sin ventana de registro, sin inscripción y hasta
--      en clases pasadas, saltándose registerAttendance por completo.
--      Sin policy de INSERT, solo service-role escribe, y únicamente tras
--      el chequeo de aplicación (mismo patrón que 028, 023, 024 y 027).
--
--   b) sessions_select (015/016) deja leer las filas de sus clases a
--      estudiantes inscritos, y SELECT trae también qr_token y
--      previous_qr_token: un estudiante podía pedir el token vigente por
--      PostgREST desde su casa y pasar el chequeo del QR sin estar en
--      clase. Los tokens solo deben salir por código de servidor.
--
-- Privilegios por columna en Postgres: un REVOKE SELECT (columna) NO tiene
-- efecto mientras exista un GRANT SELECT a nivel de tabla (los privilegios
-- de columna se suman al de tabla, no lo recortan). Por eso se quita el
-- SELECT de tabla y se otorga SELECT solo sobre las columnas permitidas.
--
-- Consecuencias a tener presentes:
--   - `SELECT *` sobre `sessions` con un JWT de usuario ahora falla
--     (42501 permission denied): hay que listar columnas.
--   - Una columna NUEVA de `sessions` no será legible para anon /
--     authenticated hasta que su migración agregue
--     `GRANT SELECT (<columna>) ON public.sessions TO anon, authenticated`.
--     Es un fallo seguro (cerrado por defecto) y el e2e
--     10-security-attendance.spec.ts lo detecta.
--   - service_role no se toca: conserva todos los privilegios.
--   - INSERT/UPDATE/DELETE sobre `sessions` ya estaban sin policy (028).
-- ============================================================

-- a) Asistencias: sin INSERT directo desde usuarios.
DROP POLICY IF EXISTS attendances_insert ON public.attendances;

-- b) Sesiones: todo menos los tokens QR.
REVOKE SELECT ON public.sessions FROM anon, authenticated;

GRANT SELECT (
  id,
  subject_id,
  date,
  duration_minutes,
  expires_at,
  is_active,
  latitude,
  longitude,
  qr_rotation_seconds,
  modality,
  is_makeup,
  makeup_reason,
  class_ends_at,
  note,
  suspended_at,
  suspended_by,
  suspension_reason
) ON public.sessions TO anon, authenticated;
