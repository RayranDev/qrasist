-- Agregar columna email a profiles para no depender del admin API en cada carga
-- Ejecutar en el SQL Editor de Supabase

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email TEXT;

-- Poblar los emails de usuarios existentes desde auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id;

-- Actualizar el trigger para que incluya el email al crear nuevos usuarios
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

-- Verificación
SELECT id, name, email FROM public.profiles LIMIT 10;
