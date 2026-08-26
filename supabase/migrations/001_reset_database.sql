-- ============================================================
-- 1. DESTRUCCIÓN TOTAL (CLEANUP)
-- ============================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

DROP TABLE IF EXISTS public.attendances CASCADE;
DROP TABLE IF EXISTS public.sessions CASCADE;
DROP TABLE IF EXISTS public.enrollments CASCADE;
DROP TABLE IF EXISTS public.subjects CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TYPE IF EXISTS user_role CASCADE;

-- Eliminar todos los usuarios y sus identidades (Seguro en entorno dev)
DELETE FROM auth.identities;
DELETE FROM auth.users;

-- ============================================================
-- 2. RECONSTRUCCIÓN DEL ESQUEMA
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('ADMIN', 'PROFESSOR', 'STUDENT');

CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  role user_role NOT NULL DEFAULT 'STUDENT',
  name TEXT NOT NULL,
  student_code TEXT UNIQUE,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE subjects (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  professor_id UUID REFERENCES profiles(id),
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE enrollments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(student_id, subject_id)
);

CREATE TABLE sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  subject_id UUID REFERENCES subjects(id) ON DELETE CASCADE,
  date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  duration_minutes INT DEFAULT 90,
  qr_token UUID DEFAULT uuid_generate_v4(),
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE attendances (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
  student_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  scanned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  ip_address TEXT,
  UNIQUE(session_id, student_id)
);

-- ============================================================
-- 3. TRIGGER CORREGIDO (Evita error al crear desde Interfaz)
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name, student_code, email)
  VALUES (
    new.id,
    'STUDENT',
    COALESCE(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'student_code',
    new.email
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- ============================================================
-- 4. INSERTAR USUARIOS (Con Identities correctos)
-- ============================================================
-- Insertar Admin (admin@test.com / Admin1234!)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'admin@test.com', crypt('Admin1234!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Administrador Principal"}', now(), now(), 'authenticated', 'authenticated');

INSERT INTO auth.identities (id, user_id, provider, identity_data, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (uuid_generate_v4(), '00000000-0000-0000-0000-000000000001', 'email', '{"sub": "00000000-0000-0000-0000-000000000001", "email": "admin@test.com"}', '00000000-0000-0000-0000-000000000001', now(), now(), now());

-- Insertar Estudiante (student1@test.com / Student1234!)
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, role, aud)
VALUES ('00000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'student1@test.com', crypt('Student1234!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Estudiante Prueba"}', now(), now(), 'authenticated', 'authenticated');

INSERT INTO auth.identities (id, user_id, provider, identity_data, provider_id, last_sign_in_at, created_at, updated_at)
VALUES (uuid_generate_v4(), '00000000-0000-0000-0000-000000000004', 'email', '{"sub": "00000000-0000-0000-0000-000000000004", "email": "student1@test.com"}', '00000000-0000-0000-0000-000000000004', now(), now(), now());

-- Ajustar roles (el trigger ya los creó como STUDENT)
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '00000000-0000-0000-0000-000000000001';

-- ============================================================
-- 5. MATERIAS DE PRUEBA
-- ============================================================
INSERT INTO public.subjects (name, code) VALUES ('Materia de Prueba 1', 'MAT-101');
