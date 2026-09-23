-- ============================================================
-- 025: permitir crear ADMIN con correo no institucional
-- ============================================================
-- handle_new_user siempre insertaba el perfil como STUDENT y
-- createUserAccount lo pasaba a ADMIN en un UPDATE posterior. Pero
-- chk_email_domain (005) exige correo institucional salvo para ADMIN
-- y se evalua en ese primer INSERT: crear un ADMIN con un correo
-- externo fallaba con "Database error creating new user".
--
-- No se puede tomar el rol del alta: user_metadata lo controla el
-- propio usuario en el registro publico, y app_metadata (solo service
-- role) GoTrue lo escribe DESPUES del INSERT en auth.users, asi que el
-- trigger no lo ve.
--
-- Solucion: para correos no institucionales el trigger no crea perfil.
-- createUserAccount (service role, solo ADMIN) lo crea completo con
-- upsert, con rol y correo en la misma escritura. Un registro publico
-- con correo externo por la API sigue sin obtener perfil -- sin perfil
-- no hay rol ni acceso (my_role() devuelve NULL), igual que antes,
-- cuando la restriccion hacia fallar el alta.
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  IF new.email IS NOT NULL AND new.email NOT LIKE '%@urepublicana.edu.co' THEN
    RETURN new;
  END IF;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
