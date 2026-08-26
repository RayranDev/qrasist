-- ============================================================
-- FIX: el trigger anti-escalada de 006_rls_policies.sql bloqueaba
-- por error los cambios de rol/is_active hechos con la
-- service_role key (createUserAccount, updateUserAccount).
--
-- Causa: `public.my_role()` devuelve NULL cuando auth.uid() es
-- NULL (contexto de service_role, sin sesión de usuario). La
-- condición `IS DISTINCT FROM 'ADMIN'` es NULL-safe: trata
-- NULL y 'ADMIN' como distintos, así que la restricción se
-- disparaba también para service_role -- que en el resto del
-- sistema siempre bypasea RLS y debería poder hacer estos
-- cambios sin restricción (ya está protegido por venir solo de
-- codigo server-only con verifyAdminAccess() antes).
--
-- Fix: la restricción solo aplica cuando SI hay un usuario
-- autenticado (auth.uid() no es NULL) actuando via el cliente de
-- sesión. Sin sesión (service_role), no se restringe nada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.my_role() IS DISTINCT FROM 'ADMIN' THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Solo un ADMIN puede cambiar el rol de un usuario';
    END IF;
    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Solo un ADMIN puede activar/desactivar usuarios';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
