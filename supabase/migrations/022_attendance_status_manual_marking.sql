-- ============================================================
-- MIGRACIÓN: Estado de asistencia (tarde) + marcado manual
--
-- Fase 2a: hasta ahora una fila en attendances solo podía
-- significar "presente" (la ausencia es la falta de fila, ver
-- 007). Se agrega:
--
--   - attendances.status: PRESENT/LATE. El profesor puede
--     configurar un umbral de tolerancia (subjects.late_after_minutes)
--     y registerAttendance() decide el estado comparando la hora
--     de escaneo contra sessions.date + ese umbral.
--   - attendances.marked_by / manual_reason: trazabilidad de
--     cuándo una fila fue insertada o corregida a mano por un
--     profesor/admin en vez de por el escaneo del propio
--     estudiante (ver src/lib/actions/attendanceManual.ts).
--   - subjects.late_after_minutes: NULL desactiva el seguimiento
--     de tardanzas para esa materia (todo llega como PRESENT).
--   - subjects.lates_per_absence: cuántas tardanzas equivalen a
--     una falta en el cálculo de inasistencias (computeAttendanceSummary).
--     NULL = las tardanzas nunca se convierten en falta.
--
-- Aditivo e idempotente: las columnas nuevas tienen default, así
-- que las filas existentes quedan como PRESENT (comportamiento
-- histórico) y el código ya desplegado de main (que no conoce estas
-- columnas) sigue funcionando sin cambios.
-- ============================================================

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'PRESENT'
    CHECK (status IN ('PRESENT', 'LATE')),
  ADD COLUMN IF NOT EXISTS marked_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS manual_reason TEXT;

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS late_after_minutes INT DEFAULT 15
    CHECK (late_after_minutes IS NULL OR late_after_minutes BETWEEN 1 AND 180),
  ADD COLUMN IF NOT EXISTS lates_per_absence INT DEFAULT NULL
    CHECK (lates_per_absence IS NULL OR lates_per_absence BETWEEN 1 AND 10);
