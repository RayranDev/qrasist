-- ============================================================
-- MIGRACIÓN: Borrar IP y ubicación guardadas de clases virtuales
--
-- La IP y la ubicación (GPS) solo se capturan en clases presenciales
-- (src/lib/attendance/captureScope.ts). Antes de ese cambio también se
-- guardaban en las clases virtuales, donde son datos personales sin una
-- razón antifraude que los justifique. Con la aprobación del propietario,
-- esta migración borra lo ya guardado:
--
--   * attendances: ip_address, latitude y longitude pasan a NULL cuando la
--     sesión es VIRTUAL. El marcador literal 'manual' de ip_address se
--     conserva: no es una IP, solo indica que la fila se marcó a mano.
--   * sessions: latitude y longitude (ubicación del profesor) pasan a NULL
--     cuando la sesión es VIRTUAL.
--   * audit_log: se quita la clave details->original_ip_address de las
--     entradas 'attendance.relocate' cuya sesión de origen es VIRTUAL (esa
--     IP es una copia de la que tenía la fila de asistencia).
--
-- Las sesiones con modality NULL (anteriores a la migración 026) o
-- 'PRESENCIAL' no se tocan. Ninguna otra columna cambia.
--
-- Idempotente: cada UPDATE solo alcanza filas que aún tienen el dato, así
-- que una segunda ejecución no modifica nada.
--
-- Antes de aplicarla, para contar lo que va a cambiar:
--   SELECT
--     (SELECT count(*) FROM public.attendances a
--        JOIN public.sessions s ON s.id = a.session_id
--       WHERE s.modality = 'VIRTUAL'
--         AND ((a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
--              OR a.latitude IS NOT NULL OR a.longitude IS NOT NULL)) AS attendances,
--     (SELECT count(*) FROM public.sessions s
--       WHERE s.modality = 'VIRTUAL'
--         AND (s.latitude IS NOT NULL OR s.longitude IS NOT NULL)) AS sessions,
--     (SELECT count(*) FROM public.audit_log al
--        JOIN public.sessions s ON s.id::text = al.details->>'from_session_id'
--       WHERE al.action = 'attendance.relocate'
--         AND s.modality = 'VIRTUAL'
--         AND al.details->>'original_ip_address' IS NOT NULL
--         AND al.details->>'original_ip_address' <> 'manual') AS audit_entries;
--
-- Queda fuera, por no estar ligado a una sesión: rate_limits guarda claves
-- 'scan:ip:<ip>' por ventana de un minuto y se purga sola (filas de más de
-- un día).
-- ============================================================

UPDATE public.attendances a
SET
  ip_address = CASE WHEN a.ip_address = 'manual' THEN a.ip_address ELSE NULL END,
  latitude = NULL,
  longitude = NULL
FROM public.sessions s
WHERE s.id = a.session_id
  AND s.modality = 'VIRTUAL'
  AND (
    (a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
    OR a.latitude IS NOT NULL
    OR a.longitude IS NOT NULL
  );

UPDATE public.sessions
SET latitude = NULL, longitude = NULL
WHERE modality = 'VIRTUAL'
  AND (latitude IS NOT NULL OR longitude IS NOT NULL);

UPDATE public.audit_log al
SET details = al.details - 'original_ip_address'
FROM public.sessions s
WHERE al.action = 'attendance.relocate'
  AND s.id::text = al.details->>'from_session_id'
  AND s.modality = 'VIRTUAL'
  AND al.details->>'original_ip_address' IS NOT NULL
  AND al.details->>'original_ip_address' <> 'manual';
