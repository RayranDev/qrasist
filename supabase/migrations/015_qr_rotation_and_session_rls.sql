-- ============================================================
-- MIGRACIÓN: QR rotativo + cierre de exposicion de sessions_select
--
-- Contexto (antifraude, parte 3 de 4): el QR de una sesion era
-- estatico por 15 minutos -- tiempo mas que suficiente para que un
-- estudiante le saque foto y se la mande a un compañero ausente, que
-- lo escanea desde su casa. Se agrega previous_qr_token para poder
-- rotar el token cada ~20 segundos sin rechazar de forma injusta un
-- escaneo que llego justo en el borde de la rotacion (se acepta el
-- token actual O el inmediatamente anterior).
--
-- De paso se encontro y cierra un hueco real: sessions_select solo
-- exigia "estar activo" -- cualquier estudiante autenticado podia
-- leer la tabla sessions completa via la API REST propia de
-- PostgREST y obtener el qr_token de CUALQUIER clase de CUALQUIER
-- materia, sin siquiera estar en el salon. subjects_select sigue
-- abierto a proposito (es un catalogo publico de materias), pero
-- sessions.qr_token es un secreto real y no deberia poder listarse.
--
-- El flujo de invitados (estudiante no inscrito que escanea) se seguia
-- rompiendo con un simple "solo inscritos pueden ver" porque un
-- invitado nuevo no tiene inscripcion NI asistencia previa en el
-- momento de escanear -- por eso registerAttendance() pasa a resolver
-- la sesion por su token usando el cliente de servicio (que no pasa
-- por RLS), ya que esa es una validacion de secreto, no de
-- visibilidad de fila. La policy de aca abajo protege el acceso
-- directo por REST/PostgREST con la clave del usuario, no ese camino.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS previous_qr_token UUID;

DROP POLICY IF EXISTS sessions_select ON public.sessions;
CREATE POLICY sessions_select ON public.sessions
  FOR SELECT
  USING (
    public.is_active_self()
    AND (
      public.my_role() = 'ADMIN'
      OR EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = sessions.subject_id AND s.professor_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.enrollments e
        WHERE e.subject_id = sessions.subject_id AND e.student_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.attendances a
        WHERE a.session_id = sessions.id AND a.student_id = auth.uid()
      )
    )
  );
