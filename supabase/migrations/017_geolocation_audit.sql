-- ============================================================
-- MIGRACIÓN: Geolocalización opcional (antifraude, parte 4 de 4)
--
-- Se guarda, a mejor esfuerzo, la ubicacion del profesor al generar
-- el QR y la del estudiante al escanear. Es deliberadamente NO
-- bloqueante: el GPS en interiores es poco confiable y existen apps
-- de ubicacion falsa, asi que exigirlo generaria falsos rechazos a
-- estudiantes reales. Sirve como señal adicional de auditoria (ver
-- HistoryDrillDown), igual que la IP -- el profesor la revisa, el
-- sistema no bloquea solo.
-- ============================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

ALTER TABLE public.attendances
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
