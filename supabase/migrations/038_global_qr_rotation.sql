-- ============================================================
-- MIGRACIÓN: Rotación del código QR GLOBAL
--
-- Hasta ahora el intervalo de rotación del QR (10-60 s, migración 018) lo
-- elegía el profesor en cada sesión desde "Ajustar rotación del código".
-- Por decisión de coordinación pasa a ser un parámetro GLOBAL, como el resto
-- de la configuración de asistencia (027, 037): solo el coordinador (ADMIN) lo
-- edita, con motivo obligatorio y auditoría; la reunión acordó 20 segundos.
--
-- Diseño: sessions.qr_rotation_seconds sigue siendo el valor EFECTIVO de cada
-- sesión (QRDisplay y el refresco del token no cambian, y las sesiones ya
-- creadas conservan el suyo); la base de datos fuerza el valor global:
--
--   1) app_settings.qr_rotation_seconds (entero, NOT NULL, 10-60, por defecto
--      20). La fila singleton existente queda en 20.
--
--   2) Trigger BEFORE INSERT en sessions: pone SIEMPRE el valor global en
--      qr_rotation_seconds, sin importar lo que traiga el INSERT. Así el
--      código anterior de main (que inserta el valor elegido por el profesor)
--      sigue funcionando: el trigger lo reemplaza en silencio. La lectura de
--      app_settings usa FOR SHARE (se serializa con un UPDATE concurrente de
--      la configuración) y, si la fila singleton no existe, falla con un
--      mensaje claro. Es SECURITY DEFINER con search_path fijo, igual que
--      apply_global_attendance_policy (037).
--
--   3) Trigger BEFORE UPDATE en sessions: una sesión autenticada que no es
--      ADMIN (auth.uid() NOT NULL y my_role() distinto de 'ADMIN') no puede
--      cambiar qr_rotation_seconds de una sesión existente. Service-role y
--      migraciones (auth.uid() NULL) siguen permitidos.
--
-- Qué podían escribir los profesores directamente en sessions ANTES de esta
-- migración: nada. Desde la 028 `sessions` solo tiene la policy de SELECT
-- (015/016); aunque `authenticated` conserva los GRANT de INSERT/UPDATE a
-- nivel de tabla, sin policy de escritura la RLS los rechaza. Toda escritura
-- va con service-role después de checkSubjectProfessor (createSession). Los
-- triggers de esta migración son una segunda barrera por si algún día se
-- vuelve a abrir una policy de escritura.
--
-- Escritura de app_settings: sin policies de escritura (027); sigue pasando por
-- src/lib/actions/appSettings.ts con service-role después de checkAdmin().
--
-- Idempotente: ADD COLUMN IF NOT EXISTS (el CHECK en línea solo se crea junto
-- con la columna), CREATE OR REPLACE en las funciones y los triggers se
-- recrean; una segunda ejecución no modifica datos.
--
-- Antes de aplicarla, consulta de SOLO LECTURA con la distribución de los
-- valores actuales de sessions.qr_rotation_seconds (informativa: esas sesiones
-- conservan su valor; el global se siembra en 20):
--   SELECT qr_rotation_seconds, count(*) AS sesiones
--     FROM public.sessions
--    GROUP BY qr_rotation_seconds
--    ORDER BY qr_rotation_seconds;
-- ============================================================

-- ------------------------------------------------------------
-- 1. Parámetro global
-- ------------------------------------------------------------
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS qr_rotation_seconds INTEGER NOT NULL DEFAULT 20
    CHECK (qr_rotation_seconds BETWEEN 10 AND 60);

-- ------------------------------------------------------------
-- 2. Las sesiones nuevas toman SIEMPRE el valor global
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_global_qr_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  global_seconds INTEGER;
BEGIN
  -- FOR SHARE serializa esta lectura con un UPDATE concurrente de app_settings:
  -- una sesión creada mientras el coordinador guarda el cambio espera y lee el
  -- valor nuevo.
  SELECT qr_rotation_seconds INTO global_seconds
  FROM public.app_settings
  WHERE id = 1
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No existe la fila de configuración global (app_settings, id = 1): no se puede fijar la rotación del código QR';
  END IF;

  NEW.qr_rotation_seconds := global_seconds;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_apply_global_qr_rotation ON public.sessions;
CREATE TRIGGER trg_sessions_apply_global_qr_rotation
  BEFORE INSERT ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.apply_global_qr_rotation();

-- ------------------------------------------------------------
-- 3. Solo un ADMIN puede cambiar la rotación de una sesión existente
--    Misma condición que protect_subject_admin_columns (011/037):
--    auth.uid() IS NOT NULL deja pasar a service-role y migraciones, y
--    my_role() NULL (cuenta inactiva) cuenta como no-ADMIN.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_session_qr_rotation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
    AND public.my_role() IS DISTINCT FROM 'ADMIN'
    AND NEW.qr_rotation_seconds IS DISTINCT FROM OLD.qr_rotation_seconds
  THEN
    RAISE EXCEPTION 'Solo un ADMIN puede modificar la rotación del código QR';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sessions_protect_qr_rotation ON public.sessions;
CREATE TRIGGER trg_sessions_protect_qr_rotation
  BEFORE UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.protect_session_qr_rotation();
