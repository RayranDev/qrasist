-- ============================================================
-- MIGRACIÓN: Bitácora de auditoría (audit_log)
--
-- Fase 2b: hasta ahora las acciones sensibles (marcado manual de
-- asistencia, revisión de solicitudes, cambios de rol/cuenta,
-- política global) solo dejaban un console.log de servidor -- sin
-- valor para una investigación posterior. Esta tabla centraliza esas
-- acciones con quién, qué, sobre qué entidad y cuándo.
--
-- Solo el ADMIN puede leerla (RLS de SELECT). No se agregan policies
-- de INSERT/UPDATE/DELETE a propósito: todas las escrituras las hace
-- el logger de servidor (src/lib/audit/auditLog.ts) con el cliente
-- service-role, que bypassa RLS. Así ningún rol vía PostgREST puede
-- insertar una entrada falsa o borrar el rastro.
--
-- Nueva tabla, sin FKs hacia tablas existentes que ya tengan otra FK
-- al mismo destino: actor_id -> profiles es la única FK de esta tabla
-- hacia profiles, así que no introduce ambigüedad en ningún embed
-- existente de profiles (el problema que causó la migración 022 en
-- attendances, que sí quedó con dos FKs a profiles).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id   TEXT,
  subject_id  UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  details     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_id_idx ON public.audit_log (actor_id);
CREATE INDEX IF NOT EXISTS audit_log_subject_id_idx ON public.audit_log (subject_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select ON public.audit_log
  FOR SELECT USING (public.my_role() = 'ADMIN');

-- A propósito no hay policies de INSERT/UPDATE/DELETE: sin ellas, ni
-- anon ni authenticated pueden escribir vía PostgREST (mismo patrón
-- que rate_limits en 020). Solo el service_role, usado exclusivamente
-- por logAudit(), puede insertar.
