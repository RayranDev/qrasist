-- ============================================================
-- SETUP INICIAL — QR-Asist
-- PASO 1: Ejecuta este script completo en el SQL Editor de Supabase
-- PASO 2: Crea el admin desde Authentication > Users > "Add user"
--         (ver instrucciones al final del script)
-- ============================================================

-- ============================================================
-- 1. LIMPIAR DATOS (orden correcto por FK)
-- ============================================================
DELETE FROM public.attendances;
DELETE FROM public.sessions;
DELETE FROM public.enrollments;
DELETE FROM public.subjects;
DELETE FROM public.profiles;
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- ============================================================
-- 2. CREAR MATERIAS
-- ============================================================
INSERT INTO public.subjects (name, code) VALUES
  ('Algoritmos',                          'ALG-101'),
  ('Cálculo I',                           'CAL-101'),
  ('Física I',                            'FIS-101'),
  ('Optativa I',                          'OPT-101'),
  ('Optativa II',                         'OPT-102'),
  ('Programación Orientada a Objetos',    'POO-201'),
  ('Base de Datos',                       'BDD-201'),
  ('Desarrollo en Dispositivos Móviles',  'DDM-301');

-- ============================================================
-- 3. CONSTRAINT: dominio institucional para docentes/estudiantes
-- ============================================================
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS chk_email_domain;

ALTER TABLE public.profiles
  ADD CONSTRAINT chk_email_domain CHECK (
    role = 'ADMIN'
    OR email IS NULL
    OR email LIKE '%@urepublicana.edu.co'
  );

-- ============================================================
-- 4. VERIFICACIÓN
-- ============================================================
SELECT code, name FROM public.subjects ORDER BY name;

-- ============================================================
-- PASO 2 — CREAR EL ADMIN (hacer DESPUÉS de ejecutar este script)
-- ============================================================
-- 1. En Supabase: Authentication > Users > clic en "Add user" (arriba a la derecha)
-- 2. Marca "Auto Confirm User"
-- 3. Ingresa el correo y contraseña del admin
-- 4. Clic en "Create User"
-- 5. Luego ejecuta SOLO esta consulta con el correo que usaste:

-- UPDATE public.profiles
-- SET role = 'ADMIN'
-- WHERE email = 'TU_CORREO_AQUI@urepublicana.edu.co';
