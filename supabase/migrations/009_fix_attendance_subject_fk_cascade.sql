-- ============================================================
-- FIX: la columna subject_id agregada a attendances en
-- 007_attendance_dedup.sql no tenia ON DELETE CASCADE, a
-- diferencia de session_id. La app nunca borra materias
-- fisicamente (deleteSubject hace soft delete via is_active),
-- asi que esto no afecta el uso normal -- pero bloquea con un
-- error de FK cualquier limpieza manual por SQL Editor de una
-- materia que ya tenga asistencias.
--
-- Descubierto al intentar borrar una materia de prueba a mano.
-- ============================================================

ALTER TABLE public.attendances
  DROP CONSTRAINT IF EXISTS attendances_subject_id_fkey;

ALTER TABLE public.attendances
  ADD CONSTRAINT attendances_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES public.subjects(id) ON DELETE CASCADE;
