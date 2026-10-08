-- ============================================================
-- MIGRACIÓN: Configuración global de asistencia + fin de clase
--
-- Dos piezas aditivas e idempotentes:
--
--   1. app_settings: tabla singleton (id = 1) con parámetros que el
--      coordinador (ADMIN) ajusta desde el panel:
--        - registration_window_minutes: minutos que tienen los
--          estudiantes para registrarse con el QR desde que el
--          profesor habilita la asistencia (RF11). Reemplaza el
--          valor fijo de 15 minutos que mandaba el cliente.
--        - default_class_minutes: duración de una clase cuando no se
--          puede deducir del horario semanal de la materia. Se usa
--          como respaldo para calcular el fin de clase (RF21).
--
--   2. sessions.class_ends_at: instante en que termina la CLASE (no
--      la ventana de registro, que sigue siendo expires_at). El
--      profesor solo puede corregir asistencia hasta ese momento
--      (RF21); después solo el coordinador (RF25 / RNF11). NULL en
--      sesiones anteriores a esta migración: el código usa
--      sessions.date + default_class_minutes como respaldo.
--
--   3. sessions.note: nota opcional del coordinador al registrar una
--      clase pasada a mano (contingencia de lista en papel).
--
-- Compatibilidad: el código ya desplegado en main no conoce estas
-- columnas ni la tabla, y todas tienen default o aceptan NULL, así
-- que sigue funcionando sin cambios.
-- ============================================================

-- ------------------------------------------------------------
-- 1. app_settings (singleton)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  registration_window_minutes SMALLINT NOT NULL DEFAULT 5
    CHECK (registration_window_minutes BETWEEN 1 AND 60),
  default_class_minutes       SMALLINT NOT NULL DEFAULT 120
    CHECK (default_class_minutes BETWEEN 30 AND 360),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Lectura abierta a cualquier usuario autenticado activo: el profesor
-- necesita la ventana de registro y la duración por defecto de clase.
-- Mismo criterio que careers/periods (010) y period_cuts (026).
DROP POLICY IF EXISTS app_settings_select ON public.app_settings;
CREATE POLICY app_settings_select ON public.app_settings
  FOR SELECT USING (public.is_active_self());

-- A propósito no hay policies de INSERT/UPDATE/DELETE: toda escritura
-- pasa por src/lib/actions/appSettings.ts con el cliente service-role,
-- después de checkAdmin() (mismo patrón que audit_log y period_cuts).

-- ------------------------------------------------------------
-- 2. sessions.class_ends_at + sessions.note
-- ------------------------------------------------------------
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS class_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS note TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sessions_note_length'
      AND conrelid = 'public.sessions'::regclass
  ) THEN
    ALTER TABLE public.sessions
      ADD CONSTRAINT sessions_note_length
      CHECK (note IS NULL OR char_length(note) <= 500);
  END IF;
END $$;
