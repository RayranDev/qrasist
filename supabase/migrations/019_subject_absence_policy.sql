-- ============================================================
-- MIGRACIÓN: Política de inasistencias y proyección semestral
--
-- Agrega soporte para delimitar y calcular inasistencias
-- ya sea por porcentaje (ej. 20%) o por cantidad fija de fallas (ej. 4),
-- junto con el total de clases planificadas en el semestre (ej. 16 semanas).
-- ============================================================

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS absence_rule_type TEXT NOT NULL DEFAULT 'PERCENTAGE'
    CHECK (absence_rule_type IN ('PERCENTAGE', 'FIXED_COUNT')),
  ADD COLUMN IF NOT EXISTS max_absence_percentage SMALLINT NOT NULL DEFAULT 20
    CHECK (max_absence_percentage BETWEEN 1 AND 100),
  ADD COLUMN IF NOT EXISTS max_absence_count SMALLINT
    CHECK (max_absence_count IS NULL OR max_absence_count > 0),
  ADD COLUMN IF NOT EXISTS total_planned_sessions SMALLINT NOT NULL DEFAULT 16
    CHECK (total_planned_sessions > 0);
