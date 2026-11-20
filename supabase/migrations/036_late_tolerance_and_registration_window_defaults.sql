-- ============================================================
-- MIGRACIÓN: Tolerancia de tardanza (20 min) y ventana de registro (30 min)
--
-- Un escaneo cuenta como tarde solo si llega pasados
-- subjects.late_after_minutes desde el inicio de la clase
-- (src/lib/actions/attendance.ts), pero los escaneos se rechazan cuando se
-- cierra la ventana de registro: sessions.expires_at = inicio +
-- app_settings.registration_window_minutes. Con los valores por defecto
-- anteriores (ventana de 5 min y tolerancia de 15 min) la ventana se cerraba
-- ANTES de que un escaneo pudiera ser tarde, así que ningún estudiante podía
-- quedar como tarde por QR.
--
-- Con lo acordado en la reunión de coordinación (20 minutos de tolerancia de
-- llegada) los nuevos valores por defecto son:
--
--   * app_settings.registration_window_minutes: 5  -> 30
--   * subjects.late_after_minutes:              15 -> 20
--
-- Esta migración:
--   1) cambia el DEFAULT de ambas columnas (afecta a las filas nuevas; los
--      rangos de los CHECK existentes, 1-60 y 1-180, no cambian);
--   2) actualiza la ventana SOLO si todavía vale el valor por defecto
--      anterior (5);
--   3) actualiza la tolerancia de las materias que todavía valen el valor por
--      defecto anterior (15) SOLO si la ventana que queda DESPUÉS del paso 2
--      es mayor que 20. Si coordinación ya había dejado la ventana entre 16
--      y 20 minutos, subir la tolerancia a 20 haría que la ventana no la
--      supere y se perdería la tardanza por QR que hoy sí funciona; en ese
--      caso las materias se dejan en 15.
--
-- Límite: un 5 o un 15 elegidos a propósito no se distinguen del valor por
-- defecto anterior, así que también se actualizan. Los demás valores
-- personalizados y NULL (seguimiento de tardanzas desactivado) no se tocan.
--
-- Cómo se calcula la tardanza NO cambia. Las sesiones ya creadas conservan su
-- expires_at: la nueva ventana aplica solo a las clases que se inicien desde
-- ahora.
--
-- Idempotente: SET DEFAULT puede repetirse, y los UPDATE solo alcanzan filas
-- que aún tienen el valor anterior (el paso 2 va primero y el paso 3 depende
-- de su resultado), así que una segunda ejecución no modifica nada.
--
-- Antes de aplicarla, para contar lo que va a cambiar (solo lectura; la
-- ventana "después" se calcula igual que lo hará el paso 2, y sin fila en
-- app_settings se usa el valor por defecto nuevo, 30):
--   SELECT
--     (SELECT count(*) FROM public.app_settings
--        WHERE registration_window_minutes = 5) AS app_settings_rows,
--     (SELECT count(*) FROM public.subjects
--        WHERE late_after_minutes = 15
--          AND COALESCE(
--                (SELECT CASE WHEN registration_window_minutes = 5
--                             THEN 30 ELSE registration_window_minutes END
--                   FROM public.app_settings WHERE id = 1),
--                30) > 20) AS subjects_rows;
-- ============================================================

ALTER TABLE public.app_settings
  ALTER COLUMN registration_window_minutes SET DEFAULT 30;

ALTER TABLE public.subjects
  ALTER COLUMN late_after_minutes SET DEFAULT 20;

-- Primero la ventana: el UPDATE de materias lee su valor ya actualizado.
UPDATE public.app_settings
SET registration_window_minutes = 30
WHERE registration_window_minutes = 5;

UPDATE public.subjects
SET late_after_minutes = 20
WHERE late_after_minutes = 15
  AND COALESCE(
        (SELECT registration_window_minutes FROM public.app_settings WHERE id = 1),
        30
      ) > 20;
