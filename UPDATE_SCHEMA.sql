-- Ejecuta este comando en el SQL Editor de Supabase
-- para añadir el soporte de código estudiantil y evitar homónimos.

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS student_code TEXT;
