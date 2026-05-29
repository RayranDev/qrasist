-- ============================================================
-- SETUP INICIAL — QR-Asist
-- Limpia la base de datos y crea el admin + materias base
-- Ejecutar en el SQL Editor de Supabase
-- ============================================================

-- ⚠️  CAMBIA ESTOS VALORES ANTES DE EJECUTAR ⚠️
-- ============================================================
DO $$
DECLARE
  v_admin_email    TEXT := 'admin@urepublicana.edu.co';   -- ← Cambia esto
  v_admin_password TEXT := 'Admin1234!';                   -- ← Cambia esto
  v_admin_name     TEXT := 'Administrador';                -- ← Cambia esto
  v_admin_id       UUID;
BEGIN

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
-- 2. CREAR USUARIO ADMIN
-- ============================================================
v_admin_id := gen_random_uuid();

INSERT INTO auth.users (
  id, instance_id, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud
) VALUES (
  v_admin_id,
  '00000000-0000-0000-0000-000000000000',
  v_admin_email,
  crypt(v_admin_password, gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  jsonb_build_object('full_name', v_admin_name),
  now(), now(),
  'authenticated', 'authenticated'
);

INSERT INTO auth.identities (id, user_id, provider, identity_data, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (
  gen_random_uuid(), v_admin_id, 'email',
  jsonb_build_object('sub', v_admin_id::text, 'email', v_admin_email),
  v_admin_id::text,
  now(), now(), now()
);

-- El trigger crea el profile como STUDENT; lo subimos a ADMIN
UPDATE public.profiles
SET role = 'ADMIN', email = v_admin_email
WHERE id = v_admin_id;

-- ============================================================
-- 3. CREAR MATERIAS
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
-- 4. VALIDACIÓN DE DOMINIO (constraint en profiles)
--    Solo docentes y estudiantes deben usar @urepublicana.edu.co
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
-- 5. VERIFICACIÓN FINAL
-- ============================================================
RAISE NOTICE 'Admin creado: %', v_admin_email;
RAISE NOTICE 'Materias creadas: %', (SELECT COUNT(*) FROM public.subjects);
RAISE NOTICE 'Usuarios totales: %', (SELECT COUNT(*) FROM public.profiles);

END $$;

-- Ver resultado
SELECT role, name, email FROM public.profiles;
SELECT code, name FROM public.subjects ORDER BY name;
