-- ============================================================
-- MIGRACIÓN: Borrar IP y ubicación guardadas de clases virtuales
--
-- La IP y la ubicación (GPS) solo se capturan en clases presenciales
-- (src/lib/attendance/captureScope.ts). Antes de ese cambio también se
-- guardaban en las clases virtuales, donde son datos personales sin una
-- razón antifraude que los justifique. Con la aprobación del propietario,
-- esta migración borra lo ya guardado:
--
--   * attendances: ip_address, latitude y longitude pasan a NULL en dos casos:
--       a) la asistencia está HOY en una sesión VIRTUAL (venga de donde venga:
--          una asistencia presencial reubicada a una clase virtual también);
--       b) la asistencia nació en una clase VIRTUAL y luego se reubicó a otra
--          sesión (ver "Reubicadas" abajo).
--     El marcador literal 'manual' de ip_address se conserva: no es una IP,
--     solo indica que la fila se marcó a mano.
--   * sessions: latitude y longitude (ubicación del profesor) pasan a NULL
--     cuando la sesión es VIRTUAL.
--   * audit_log: se quita la clave details->original_ip_address de las
--     entradas 'attendance.relocate' cuya sesión de origen es VIRTUAL (esa
--     IP es una copia de la que tenía la fila de asistencia).
--
-- Reubicadas (caso b). Una reubicación mueve LA MISMA fila (solo cambia
-- session_id; scanned_at, IP y ubicación se conservan) y deja una entrada
-- 'attendance.relocate' que identifica la fila y su origen:
--   * manual:  entity_type = 'attendance', entity_id = id de la asistencia,
--              details.from_session_id = sesión de origen.
--   * reposición tras una suspensión: entity_type = 'session',
--              details.attendance_ids = ids de las asistencias movidas,
--              details.from_session_ids = sesiones suspendidas de origen. Una
--              entrada puede juntar filas de varias sesiones sin decir cuál de
--              cuál: solo se limpian si TODAS las sesiones de origen son
--              VIRTUAL (si mezclan modalidades no se adivina y se dejan).
-- Solo se limpia si la fila no se volvió a registrar con datos reales después:
-- una asistencia borrada y escaneada de nuevo es una fila NUEVA (otro id), así
-- que no coincide con la bitácora; y además se exige que scanned_at sea
-- anterior o igual a la reubicación (una fila escaneada después no pudo ser la
-- que se movió).
--
-- Las sesiones con modality NULL (anteriores a la migración 026) o
-- 'PRESENCIAL' no se tocan, salvo las filas del caso b). Ninguna otra columna
-- cambia.
--
-- Idempotente: cada UPDATE solo alcanza filas que aún tienen el dato, así
-- que una segunda ejecución no modifica nada.
--
-- Antes de aplicarla, para contar lo que va a cambiar (cada condición es la
-- misma de su UPDATE):
--   SELECT
--     (SELECT count(*) FROM public.attendances a
--       WHERE (a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
--          OR a.latitude IS NOT NULL OR a.longitude IS NOT NULL) AS attendances_with_data,
--     (SELECT count(*) FROM public.attendances a
--       WHERE ((a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
--              OR a.latitude IS NOT NULL OR a.longitude IS NOT NULL)
--         AND (EXISTS (SELECT 1 FROM public.sessions s
--                       WHERE s.id = a.session_id AND s.modality = 'VIRTUAL')
--              OR EXISTS (SELECT 1 FROM public.audit_log al
--                          WHERE al.action = 'attendance.relocate'
--                            AND al.created_at >= a.scanned_at
--                            AND ((al.entity_type = 'attendance'
--                                  AND al.entity_id = a.id::text
--                                  AND EXISTS (SELECT 1 FROM public.sessions s
--                                               WHERE s.id::text = al.details->>'from_session_id'
--                                                 AND s.modality = 'VIRTUAL'))
--                                 OR (al.entity_type = 'session'
--                                     AND jsonb_typeof(al.details->'attendance_ids') = 'array'
--                                     AND al.details->'attendance_ids' @> to_jsonb(a.id::text)
--                                     AND jsonb_typeof(al.details->'from_session_ids') = 'array'
--                                     AND jsonb_array_length(al.details->'from_session_ids') > 0
--                                     AND NOT EXISTS (
--                                       SELECT 1 FROM jsonb_array_elements_text(al.details->'from_session_ids') f(id)
--                                        WHERE NOT EXISTS (SELECT 1 FROM public.sessions s
--                                                           WHERE s.id::text = f.id AND s.modality = 'VIRTUAL'))))))
--      ) AS attendances,
--     (SELECT count(*) FROM public.sessions s
--       WHERE s.modality = 'VIRTUAL'
--         AND (s.latitude IS NOT NULL OR s.longitude IS NOT NULL)) AS sessions,
--     (SELECT count(*) FROM public.audit_log al
--        JOIN public.sessions s ON s.id::text = al.details->>'from_session_id'
--       WHERE al.action = 'attendance.relocate'
--         AND s.modality = 'VIRTUAL'
--         AND al.details->>'original_ip_address' IS NOT NULL
--         AND al.details->>'original_ip_address' <> 'manual') AS audit_entries;
-- (attendances_with_data es solo de referencia: todas las asistencias con
-- algún dato, para medir cuánto queda intacto, que son las presenciales.)
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
WHERE (
    (a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
    OR a.latitude IS NOT NULL
    OR a.longitude IS NOT NULL
  )
  AND (
    -- a) hoy está en una sesión virtual
    EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.id = a.session_id AND s.modality = 'VIRTUAL'
    )
    -- b) nació en una clase virtual y se reubicó
    OR EXISTS (
      SELECT 1 FROM public.audit_log al
      WHERE al.action = 'attendance.relocate'
        AND al.created_at >= a.scanned_at
        AND (
          (
            al.entity_type = 'attendance'
            AND al.entity_id = a.id::text
            AND EXISTS (
              SELECT 1 FROM public.sessions s
              WHERE s.id::text = al.details->>'from_session_id'
                AND s.modality = 'VIRTUAL'
            )
          )
          OR (
            al.entity_type = 'session'
            AND jsonb_typeof(al.details->'attendance_ids') = 'array'
            AND al.details->'attendance_ids' @> to_jsonb(a.id::text)
            AND jsonb_typeof(al.details->'from_session_ids') = 'array'
            AND jsonb_array_length(al.details->'from_session_ids') > 0
            AND NOT EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(al.details->'from_session_ids') f(id)
              WHERE NOT EXISTS (
                SELECT 1 FROM public.sessions s
                WHERE s.id::text = f.id AND s.modality = 'VIRTUAL'
              )
            )
          )
        )
    )
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
