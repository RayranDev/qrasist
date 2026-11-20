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
--   2) actualiza SOLO las filas que todavía tienen el valor por defecto
--      anterior (ventana = 5, tolerancia = 15). Los valores que coordinación
--      personalizó a propósito no se tocan. subjects.late_after_minutes NULL
--      (seguimiento de tardanzas desactivado) tampoco se toca.
--
-- Cómo se calcula la tardanza NO cambia. Las sesiones ya creadas conservan su
-- expires_at: la nueva ventana aplica solo a las clases que se inicien desde
-- ahora.
--
-- Idempotente: SET DEFAULT puede repetirse, y los UPDATE solo alcanzan filas
-- que aún tienen el valor anterior, así que una segunda ejecución no
-- modifica nada.
--
-- Antes de aplicarla, para contar lo que va a cambiar (solo lectura; cada
-- condición es la misma de su UPDATE):
--   SELECT
--     (SELECT count(*) FROM public.app_settings
--        WHERE registration_window_minutes = 5) AS app_settings_rows,
--     (SELECT count(*) FROM public.subjects
--        WHERE late_after_minutes = 15) AS subjects_rows;
-- ============================================================

ALTER TABLE public.app_settings
  ALTER COLUMN registration_window_minutes SET DEFAULT 30;

ALTER TABLE public.subjects
  ALTER COLUMN late_after_minutes SET DEFAULT 20;

UPDATE public.app_settings
SET registration_window_minutes = 30
WHERE registration_window_minutes = 5;

UPDATE public.subjects
SET late_after_minutes = 20
WHERE late_after_minutes = 15;
