-- ============================================================
-- MIGRACIÓN: Separar "name" en first_name / last_name
--
-- Contexto: se pide ver nombres y apellidos en casillas distintas
-- en vez de un solo campo de texto libre, con normalización de
-- espacios (trim + un solo espacio entre palabras).
--
-- Estrategia: en vez de tocar cada lugar del código que lee
-- profile.name (dashboard, exports, mensajes de asistencia,
-- HistoryDrillDown, etc. -- son muchos), se agregan first_name y
-- last_name como los campos reales, y "name" se convierte en una
-- columna GENERADA (name = first_name + ' ' + last_name). Todo el
-- código que solo LEE .name sigue funcionando sin cambios; solo
-- los formularios de creación/edición (que sí cambian en este
-- mismo commit del lado de la app) escriben first_name/last_name.
--
-- Backfill de nombres existentes: Postgres no puede adivinar con
-- 100% de certeza dónde termina el nombre y empieza el apellido
-- en un string libre. Se usa la convención más común en Colombia
-- (nombre(s) + dos apellidos): las últimas 2 palabras son el
-- apellido, el resto es el nombre. Para 1 palabra, todo es nombre
-- (apellido vacío) -- son las cuentas de prueba del proyecto
-- (admin/docente/estudiante/prueba), no personas reales. Casos que
-- no calcen bien con esta convención van a necesitar corrección
-- manual desde el formulario de edición -- no hay forma de
-- automatizarlo con certeza total.
-- ============================================================

-- 1. Columnas nuevas.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT;

-- 2. Backfill desde el name existente.
UPDATE public.profiles p
SET
  first_name = CASE
    WHEN w.n <= 2 THEN w.arr[1]
    ELSE array_to_string(w.arr[1 : w.n - 2], ' ')
  END,
  last_name = CASE
    WHEN w.n <= 1 THEN ''
    WHEN w.n = 2 THEN w.arr[2]
    ELSE array_to_string(w.arr[w.n - 1 : w.n], ' ')
  END
FROM (
  SELECT
    id,
    regexp_split_to_array(trim(name), '\s+') AS arr,
    array_length(regexp_split_to_array(trim(name), '\s+'), 1) AS n
  FROM public.profiles
) w
WHERE p.id = w.id
  AND p.first_name IS NULL;

ALTER TABLE public.profiles
  ALTER COLUMN first_name SET NOT NULL,
  ALTER COLUMN last_name SET NOT NULL,
  ALTER COLUMN last_name SET DEFAULT '';

-- 3. "name" pasa a ser generada -- se recalcula sola, nunca se
--    escribe directo (ni el trigger ni la app la tocan mas).
ALTER TABLE public.profiles DROP COLUMN name;
ALTER TABLE public.profiles
  ADD COLUMN name TEXT GENERATED ALWAYS AS (
    trim(both ' ' from (first_name || ' ' || last_name))
  ) STORED;

-- 4. El trigger de alta de usuario insertaba name directo -- ya no
--    se puede (una columna generada rechaza INSERT explicito).
--    Ahora toma first_name/last_name del metadata de auth.users
--    (signup y createUserAccount los mandan por separado desde
--    este mismo commit de la app).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, first_name, last_name, student_code, email)
  VALUES (
    new.id,
    'STUDENT',
    COALESCE(new.raw_user_meta_data->>'first_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data->>'last_name', ''),
    new.raw_user_meta_data->>'student_code',
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
