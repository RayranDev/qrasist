-- ============================================================
-- MIGRACIÓN 018: rotación de QR configurable por sesión
--
-- Contexto: la rotación cada 20s estaba fija en una constante de
-- QRDisplay.tsx. El profesor pidió poder ajustarla al generar la
-- sesión (salones grandes necesitan mas margen para escanear;
-- grupos chicos pueden querer rotar mas seguido). Se guarda por
-- sesión, no como config global, para no afectar otras materias.
--
-- El rango 10-60s se mantiene acotado a nivel de base de datos
-- ademas de en el server action: 10s como piso para que el
-- escaneo siga siendo humanamente posible, 60s como techo para
-- que la propiedad antifraude (una foto compartida queda inutil
-- casi de inmediato) no se diluya demasiado.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS qr_rotation_seconds INT NOT NULL DEFAULT 20;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS chk_qr_rotation_seconds_range;

ALTER TABLE public.sessions
  ADD CONSTRAINT chk_qr_rotation_seconds_range
    CHECK (qr_rotation_seconds BETWEEN 10 AND 60);
