-- ============================================================
-- MIGRACIÓN: Política de asistencia GLOBAL (heredada por las materias)
--
-- Hasta ahora la política de asistencia (tolerancia de tardanza, tardanzas
-- por falta y regla de inasistencias) vivía por materia, y el botón
-- "Configurar Política" del panel solo la SOBRESCRIBÍA en lote, sin guardar
-- los valores anteriores ni el motivo. Por acuerdo de coordinación, esos
-- parámetros pasan a ser GLOBALES: solo el coordinador (ADMIN) los edita,
-- los docentes no pueden modificarlos, cada cambio se audita con autor,
-- valor anterior, valor nuevo y motivo, y las materias nuevas heredan los
-- valores globales.
--
-- Diseño: las columnas de política de `subjects` siguen siendo los valores
-- EFECTIVOS (todo el código que ya las lee -- asistencia, tableros, reportes,
-- páginas del estudiante -- funciona sin cambios) y la base de datos fuerza la
-- herencia:
--
--   1) app_settings gana los cinco parámetros globales:
--        late_after_minutes (NULL = sin seguimiento de tardanzas, 1-180),
--        lates_per_absence (NULL = las tardanzas no se convierten en falta,
--        1-10), absence_rule_type ('PERCENTAGE' | 'FIXED_COUNT'),
--        max_absence_percentage (1-100) y max_absence_count (NULL o > 0).
--      Los CHECK replican los de subjects (019 y 022). Se siembran con la
--      MODA de las materias ACTIVAS: la política completa (las cinco
--      columnas juntas, contando NULL como un valor más) que más materias
--      comparten. Así se minimizan las materias marcadas en el punto 2. Si no
--      hay materias activas se usa: tolerancia 20, sin tardanzas por falta,
--      PERCENTAGE, 20 %, sin cantidad fija. En empate gana el valor menor
--      (NULL al final) para que el resultado sea determinista.
--
--   2) subjects.policy_override (boolean, por defecto false): true = la
--      materia tiene política personalizada. Se rellena en true SOLO en las
--      materias (activas o archivadas) cuya política actual difiere de los
--      valores globales sembrados, para que nada cambie en silencio.
--
--   3) Trigger BEFORE INSERT OR UPDATE en subjects: si NO policy_override,
--      reescribe las cinco columnas con los valores de app_settings.
--      total_planned_sessions NO se toca: depende del horario de cada materia.
--
--   4) Trigger AFTER UPDATE en app_settings: al cambiar un parámetro global
--      propaga el cambio a las materias con policy_override = false, en la
--      misma transacción (la propagación pasa por el trigger del punto 3).
--      Actualizar subjects no toca app_settings, así que no hay bucle.
--
--   5) protect_subject_admin_columns (011) se amplía: una sesión autenticada
--      que no es ADMIN (por ejemplo un docente dueño de la materia) ya no
--      puede cambiar las cinco columnas de política ni policy_override.
--      Service-role y migraciones (auth.uid() NULL) siguen permitidos.
--
-- Escritura: app_settings no tiene policies de escritura (027); sigue
-- escribiéndose con service-role desde src/lib/actions/appSettings.ts
-- después de checkAdmin().
--
-- Compatibilidad: el código anterior de main sigue funcionando, pero sus
-- ediciones de política en materias que heredan (policy_override = false) se
-- ignoran en silencio: el trigger las reemplaza por el valor global.
--
-- Idempotente: las columnas usan IF NOT EXISTS y la siembra, el rellenado de
-- policy_override y la creación de los CHECK ocurren una sola vez dentro de un
-- bloque protegido por la existencia de las columnas; una segunda ejecución no
-- modifica datos. Las funciones usan CREATE OR REPLACE y los triggers se
-- recrean.
--
-- Antes de aplicarla, consulta de SOLO LECTURA para ver los valores globales
-- que se sembrarán y cuántas materias quedarían con policy_override = true
-- (devuelve cero filas si no hay materias activas: se usarían los valores por
-- defecto indicados arriba; aplica sobre las materias activas y archivadas):
--   WITH moda AS (
--     SELECT late_after_minutes, lates_per_absence, absence_rule_type,
--            max_absence_percentage, max_absence_count,
--            count(*) AS materias_activas_con_esta_politica
--       FROM public.subjects
--      WHERE is_active
--      GROUP BY 1, 2, 3, 4, 5
--      ORDER BY count(*) DESC, late_after_minutes ASC NULLS LAST,
--               lates_per_absence ASC NULLS LAST, absence_rule_type ASC,
--               max_absence_percentage ASC, max_absence_count ASC NULLS LAST
--      LIMIT 1
--   )
--   SELECT m.late_after_minutes, m.lates_per_absence, m.absence_rule_type,
--          m.max_absence_percentage, m.max_absence_count,
--          m.materias_activas_con_esta_politica,
--          count(s.id) AS materias_totales,
--          count(*) FILTER (WHERE
--                s.late_after_minutes IS DISTINCT FROM m.late_after_minutes
--             OR s.lates_per_absence IS DISTINCT FROM m.lates_per_absence
--             OR s.absence_rule_type IS DISTINCT FROM m.absence_rule_type
--             OR s.max_absence_percentage IS DISTINCT FROM m.max_absence_percentage
--             OR s.max_absence_count IS DISTINCT FROM m.max_absence_count
--          ) AS quedarian_con_policy_override,
--          count(*) FILTER (WHERE s.late_after_minutes IS DISTINCT FROM m.late_after_minutes)
--            AS difieren_late_after_minutes,
--          count(*) FILTER (WHERE s.lates_per_absence IS DISTINCT FROM m.lates_per_absence)
--            AS difieren_lates_per_absence,
--          count(*) FILTER (WHERE s.absence_rule_type IS DISTINCT FROM m.absence_rule_type)
--            AS difieren_absence_rule_type,
--          count(*) FILTER (WHERE s.max_absence_percentage IS DISTINCT FROM m.max_absence_percentage)
--            AS difieren_max_absence_percentage,
--          count(*) FILTER (WHERE s.max_absence_count IS DISTINCT FROM m.max_absence_count)
--            AS difieren_max_absence_count
--     FROM public.subjects s
--     CROSS JOIN moda m
--    GROUP BY m.late_after_minutes, m.lates_per_absence, m.absence_rule_type,
--             m.max_absence_percentage, m.max_absence_count,
--             m.materias_activas_con_esta_politica;
-- ============================================================

-- ------------------------------------------------------------
-- 1 y 2. Columnas, siembra y rellenado (una sola vez, atómico)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subjects'
      AND column_name = 'policy_override'
  ) THEN
    RETURN;
  END IF;

  -- app_settings: parámetros globales (los DEFAULT dejan la fila existente con
  -- valores válidos hasta que se siembra más abajo).
  ALTER TABLE public.app_settings
    ADD COLUMN IF NOT EXISTS late_after_minutes INT DEFAULT 20
      CHECK (late_after_minutes IS NULL OR late_after_minutes BETWEEN 1 AND 180),
    ADD COLUMN IF NOT EXISTS lates_per_absence INT DEFAULT NULL
      CHECK (lates_per_absence IS NULL OR lates_per_absence BETWEEN 1 AND 10),
    ADD COLUMN IF NOT EXISTS absence_rule_type TEXT NOT NULL DEFAULT 'PERCENTAGE'
      CHECK (absence_rule_type IN ('PERCENTAGE', 'FIXED_COUNT')),
    ADD COLUMN IF NOT EXISTS max_absence_percentage SMALLINT NOT NULL DEFAULT 20
      CHECK (max_absence_percentage BETWEEN 1 AND 100),
    ADD COLUMN IF NOT EXISTS max_absence_count SMALLINT
      CHECK (max_absence_count IS NULL OR max_absence_count > 0);

  -- Garantiza la fila singleton antes de sembrarla.
  INSERT INTO public.app_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

  -- Siembra con la moda de las materias activas. GROUP BY agrupa los NULL como
  -- iguales entre sí (semántica IS NOT DISTINCT FROM), a diferencia de
  -- mode() WITHIN GROUP, que los ignora. Sin materias activas no hay fila y
  -- la fila de app_settings conserva los DEFAULT de arriba.
  UPDATE public.app_settings a
  SET late_after_minutes = m.late_after_minutes,
      lates_per_absence = m.lates_per_absence,
      absence_rule_type = m.absence_rule_type,
      max_absence_percentage = m.max_absence_percentage,
      max_absence_count = m.max_absence_count
  FROM (
    SELECT late_after_minutes, lates_per_absence, absence_rule_type,
           max_absence_percentage, max_absence_count
    FROM public.subjects
    WHERE is_active
    GROUP BY 1, 2, 3, 4, 5
    ORDER BY count(*) DESC, late_after_minutes ASC NULLS LAST,
             lates_per_absence ASC NULLS LAST, absence_rule_type ASC,
             max_absence_percentage ASC, max_absence_count ASC NULLS LAST
    LIMIT 1
  ) m
  WHERE a.id = 1;

  -- subjects.policy_override. Todavía no existen los triggers de este archivo,
  -- así que el rellenado no reescribe ninguna columna de política.
  ALTER TABLE public.subjects
    ADD COLUMN policy_override BOOLEAN NOT NULL DEFAULT false;

  UPDATE public.subjects s
  SET policy_override = true
  FROM public.app_settings a
  WHERE a.id = 1
    AND (
         s.late_after_minutes IS DISTINCT FROM a.late_after_minutes
      OR s.lates_per_absence IS DISTINCT FROM a.lates_per_absence
      OR s.absence_rule_type IS DISTINCT FROM a.absence_rule_type
      OR s.max_absence_percentage IS DISTINCT FROM a.max_absence_percentage
      OR s.max_absence_count IS DISTINCT FROM a.max_absence_count
    );
END $$;

-- ------------------------------------------------------------
-- 3. Herencia: las materias sin override toman los valores globales
--    (SECURITY DEFINER: lee app_settings sin depender de la RLS de quien
--    escribe, mismo patrón que my_role() en 006).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_global_attendance_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g public.app_settings%ROWTYPE;
BEGIN
  IF NEW.policy_override THEN
    RETURN NEW;
  END IF;

  SELECT * INTO g FROM public.app_settings WHERE id = 1;
  IF FOUND THEN
    NEW.late_after_minutes := g.late_after_minutes;
    NEW.lates_per_absence := g.lates_per_absence;
    NEW.absence_rule_type := g.absence_rule_type;
    NEW.max_absence_percentage := g.max_absence_percentage;
    NEW.max_absence_count := g.max_absence_count;
  END IF;

  RETURN NEW;
END;
$$;

-- El nombre empieza después de trg_protect_subject_admin_columns (011) para
-- que, al ser ambos BEFORE UPDATE, la protección compare lo que el usuario
-- intentó escribir y no el valor ya reescrito por la herencia.
DROP TRIGGER IF EXISTS trg_subjects_apply_global_policy ON public.subjects;
CREATE TRIGGER trg_subjects_apply_global_policy
  BEFORE INSERT OR UPDATE ON public.subjects
  FOR EACH ROW EXECUTE FUNCTION public.apply_global_attendance_policy();

-- ------------------------------------------------------------
-- 4. Propagación: un cambio global llega a las materias sin override
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.propagate_global_attendance_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Poner policy_override = false (ya lo estaba) dispara el trigger BEFORE de
  -- subjects, que reescribe las cinco columnas con los valores nuevos.
  UPDATE public.subjects s
  SET policy_override = false
  WHERE NOT s.policy_override
    AND (
         s.late_after_minutes IS DISTINCT FROM NEW.late_after_minutes
      OR s.lates_per_absence IS DISTINCT FROM NEW.lates_per_absence
      OR s.absence_rule_type IS DISTINCT FROM NEW.absence_rule_type
      OR s.max_absence_percentage IS DISTINCT FROM NEW.max_absence_percentage
      OR s.max_absence_count IS DISTINCT FROM NEW.max_absence_count
    );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_settings_propagate_policy ON public.app_settings;
CREATE TRIGGER trg_app_settings_propagate_policy
  AFTER UPDATE ON public.app_settings
  FOR EACH ROW
  WHEN (
       OLD.late_after_minutes IS DISTINCT FROM NEW.late_after_minutes
    OR OLD.lates_per_absence IS DISTINCT FROM NEW.lates_per_absence
    OR OLD.absence_rule_type IS DISTINCT FROM NEW.absence_rule_type
    OR OLD.max_absence_percentage IS DISTINCT FROM NEW.max_absence_percentage
    OR OLD.max_absence_count IS DISTINCT FROM NEW.max_absence_count
  )
  EXECUTE FUNCTION public.propagate_global_attendance_policy();

-- ------------------------------------------------------------
-- 5. Los docentes no pueden tocar la política (ni su override)
--    Misma condición que en 011: auth.uid() IS NOT NULL deja pasar a
--    service-role y migraciones, y my_role() NULL (cuenta inactiva) cuenta
--    como no-ADMIN gracias a IS DISTINCT FROM.
-- ------------------------------------------------------------
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

    IF NEW.policy_override IS DISTINCT FROM OLD.policy_override
      OR NEW.late_after_minutes IS DISTINCT FROM OLD.late_after_minutes
      OR NEW.lates_per_absence IS DISTINCT FROM OLD.lates_per_absence
      OR NEW.absence_rule_type IS DISTINCT FROM OLD.absence_rule_type
      OR NEW.max_absence_percentage IS DISTINCT FROM OLD.max_absence_percentage
      OR NEW.max_absence_count IS DISTINCT FROM OLD.max_absence_count
    THEN
      RAISE EXCEPTION 'Solo un ADMIN puede modificar la política de asistencia de una materia';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
