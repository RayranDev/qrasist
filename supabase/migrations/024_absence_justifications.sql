-- ============================================================
-- MIGRACIÓN: Justificación de inasistencias (absence_justifications)
--
-- Fase 2b: un estudiante puede justificar una falta (sesión ya
-- dictada sin asistencia registrada) subiendo un motivo y,
-- opcionalmente, un adjunto. El profesor de la materia (o un ADMIN)
-- aprueba o rechaza. Una justificación APROBADA descuenta esa falta
-- del cálculo de computeAttendanceSummary (ver justifiedCount).
--
-- Dos FKs hacia profiles (student_id y reviewed_by): a diferencia de
-- audit_log, esta tabla SÍ puede generar el mismo tipo de ambigüedad
-- que causó el incidente de la migración 022. Por eso todo embed de
-- profiles desde absence_justifications en el código de la app debe
-- pinearse explícitamente con el nombre de constraint
-- (!absence_justifications_student_id_fkey /
-- !absence_justifications_reviewed_by_fkey), nunca `profiles(...)`
-- sin calificar. Se documenta acá para que quede claro en el mismo
-- lugar donde se crean las FKs.
--
-- RLS: solo lectura. No hay policies de INSERT/UPDATE/DELETE: todas
-- las escrituras pasan por las server actions (service role) despues
-- de validar elegibilidad, ventana de 7 dias y ownership del adjunto.
-- Una policy de escritura para el estudiante seria la UNICA barrera
-- ante una llamada directa a PostgREST con su propio JWT (la anon key
-- es publica), y permitiria insertar o pasar a APPROVED su propia
-- justificacion sin revision del profesor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.absence_justifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  subject_id      UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  reason          TEXT NOT NULL CHECK (char_length(reason) BETWEEN 10 AND 1000),
  attachment_path TEXT,
  status          TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  reviewed_by     UUID REFERENCES public.profiles(id),
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, session_id)
);

CREATE INDEX IF NOT EXISTS absence_justifications_subject_id_idx ON public.absence_justifications (subject_id);
CREATE INDEX IF NOT EXISTS absence_justifications_student_id_idx ON public.absence_justifications (student_id);
CREATE INDEX IF NOT EXISTS absence_justifications_status_idx ON public.absence_justifications (status);

ALTER TABLE public.absence_justifications ENABLE ROW LEVEL SECURITY;

-- Estudiante: ve sus propias justificaciones. Profesor activo dueño de
-- la materia y ADMIN: lectura (la revisión la hace reviewJustification()
-- con service role, con claim atómico igual que approveEnrollmentRequest).
DROP POLICY IF EXISTS absence_justifications_select ON public.absence_justifications;
CREATE POLICY absence_justifications_select ON public.absence_justifications
  FOR SELECT USING (
    student_id = auth.uid()
    OR public.my_role() = 'ADMIN'
    OR (
      public.is_active_self()
      AND EXISTS (
        SELECT 1 FROM public.subjects s
        WHERE s.id = absence_justifications.subject_id
          AND s.professor_id = auth.uid()
          AND s.is_active IS NOT FALSE
      )
    )
  );

-- Versiones anteriores de esta migración creaban policies de escritura
-- para el estudiante; se eliminan si existen (ver nota de RLS arriba).
DROP POLICY IF EXISTS absence_justifications_student_insert ON public.absence_justifications;
DROP POLICY IF EXISTS absence_justifications_student_update ON public.absence_justifications;

-- ------------------------------------------------------------
-- Storage: bucket privado `justifications` para los adjuntos.
-- Se crea de forma idempotente vía API de storage en el script de
-- aplicación (no aquí por SQL) para poder fijar fileSizeLimit y
-- allowedMimeTypes con el mismo helper que usa el resto del proyecto.
-- Las policies de storage.objects sí van en SQL: el path de cada
-- objeto es `${studentId}/${sessionId}/${uuid}.${ext}`, así que el
-- primer segmento del path (storage.foldername(name))[1] identifica
-- al dueño sin necesitar una tabla intermedia.
-- ------------------------------------------------------------

DROP POLICY IF EXISTS justifications_student_read_own ON storage.objects;
CREATE POLICY justifications_student_read_own ON storage.objects
  FOR SELECT USING (
    bucket_id = 'justifications'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS justifications_reviewer_read ON storage.objects;
CREATE POLICY justifications_reviewer_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'justifications'
    AND (
      public.my_role() = 'ADMIN'
      OR (
        public.is_active_self()
        AND EXISTS (
          SELECT 1
          FROM public.absence_justifications aj
          JOIN public.subjects s ON s.id = aj.subject_id
          WHERE aj.attachment_path = storage.objects.name
            AND s.professor_id = auth.uid()
        )
      )
    )
  );

-- El upload en sí lo hace el cliente con una signed upload URL
-- (createSignedUploadUrl desde el server action, firmada con
-- service role) -- no se necesita una policy de INSERT para
-- `authenticated`/`anon`, la URL firmada ya autoriza esa única
-- escritura puntual.
