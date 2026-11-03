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
--       b) la asistencia nació en una clase VIRTUAL y se reubicó UNA sola vez
--          (ver "Reubicadas" abajo).
--     El marcador literal 'manual' de ip_address se conserva: no es una IP,
--     solo indica que la fila se marcó a mano.
--   * sessions: latitude y longitude (ubicación del profesor) pasan a NULL
--     cuando la sesión es VIRTUAL.
--   * audit_log: se quita la clave details->original_ip_address de las
--     entradas 'attendance.relocate' cuya sesión de origen es VIRTUAL (esa
--     IP es una copia de la que tenía la fila de asistencia), solo si su
--     asistencia se reubicó una única vez o hoy está en una sesión VIRTUAL.
--
-- Reubicadas (caso b). Una reubicación mueve LA MISMA fila (solo cambia
-- session_id; scanned_at, IP y ubicación se conservan) y deja una entrada
-- 'attendance.relocate' que identifica la fila y SU ORIGEN INMEDIATO:
--   * manual:  entity_type = 'attendance', entity_id = id de la asistencia,
--              details.from_session_id = sesión de origen.
--   * reposición tras una suspensión: entity_type = 'session',
--              details.attendance_ids = ids de las asistencias movidas,
--              details.from_session_ids = sesiones suspendidas de origen. Una
--              entrada puede juntar filas de varias sesiones sin decir cuál de
--              cuál: solo se limpian si TODAS las sesiones de origen son
--              VIRTUAL (si mezclan modalidades no se adivina y se dejan).
-- La entrada solo dice de dónde salió la fila en ESE salto, no dónde se
-- capturó el dato. Si la fila se reubicó varias veces (A presencial -> B
-- virtual -> C presencial), el último salto sale de una sesión virtual pero el
-- dato puede venir de A, que sí es legítimo. Como borrar es irreversible, el
-- caso b) solo aplica a filas nombradas por EXACTAMENTE UNA entrada de
-- reubicación (contando las dos formas, entity_id y attendance_ids): con un
-- único salto la sesión de origen es donde se escaneó. Las filas nombradas por
-- dos o más entradas no se tocan, salvo que hoy estén en una sesión VIRTUAL
-- (caso a), donde el dato sobra se haya capturado donde se haya capturado.
-- La misma regla vale para quitar original_ip_address de la bitácora.
-- (Una asistencia borrada y escaneada de nuevo es una fila NUEVA con otro id,
-- así que nunca coincide con una entrada anterior; por eso no hace falta
-- comparar fechas.)
--
-- Las sesiones con modality NULL (anteriores a la migración 026) o
-- 'PRESENCIAL' no se tocan, salvo las filas del caso b). Ninguna otra columna
-- cambia.
--
-- Idempotente: cada UPDATE solo alcanza filas que aún tienen el dato, así
-- que una segunda ejecución no modifica nada.
--
-- Antes de aplicarla, para contar lo que va a cambiar (cada condición es la
-- misma de su UPDATE; chained_rows_skipped son las filas con dato que esta
-- regla DEJA como están: reubicadas dos o más veces, hoy fuera de una sesión
-- virtual y con algún salto desde una virtual; attendances_with_data es solo
-- de referencia):
--   WITH named AS (
--     SELECT r.id, count(*) AS cnt
--     FROM (
--       SELECT al.entity_id AS id
--       FROM public.audit_log al
--       WHERE al.action = 'attendance.relocate'
--         AND al.entity_type = 'attendance'
--       UNION ALL
--       SELECT e.id
--       FROM public.audit_log al
--       CROSS JOIN LATERAL jsonb_array_elements_text(
--         CASE WHEN jsonb_typeof(al.details->'attendance_ids') = 'array'
--              THEN al.details->'attendance_ids' ELSE '[]'::jsonb END
--       ) AS e(id)
--       WHERE al.action = 'attendance.relocate'
--         AND al.entity_type = 'session'
--     ) r
--     GROUP BY r.id
--   )
--   SELECT
--     (SELECT count(*) FROM public.attendances a
--       WHERE ((a.ip_address IS NOT NULL AND a.ip_address <> 'manual') OR a.latitude IS NOT NULL OR a.longitude IS NOT NULL)) AS attendances_with_data,
--     (SELECT count(*) FROM public.attendances a
--       WHERE
--         (
--           (a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
--           OR a.latitude IS NOT NULL
--           OR a.longitude IS NOT NULL
--         )
--         AND (
--           -- a) hoy está en una sesión virtual
--           EXISTS (
--             SELECT 1 FROM public.sessions s
--             WHERE s.id = a.session_id AND s.modality = 'VIRTUAL'
--           )
--           -- b) nació en una clase virtual y se reubicó UNA sola vez
--           OR (
--             (SELECT n.cnt FROM named n WHERE n.id = a.id::text) = 1
--             AND EXISTS (
--               SELECT 1 FROM public.audit_log al
--               WHERE al.action = 'attendance.relocate'
--                 AND (
--                   (
--                     al.entity_type = 'attendance'
--                     AND al.entity_id = a.id::text
--                     AND EXISTS (
--                       SELECT 1 FROM public.sessions s
--                       WHERE s.id::text = al.details->>'from_session_id'
--                         AND s.modality = 'VIRTUAL'
--                     )
--                   )
--                   OR (
--                     al.entity_type = 'session'
--                     AND jsonb_typeof(al.details->'attendance_ids') = 'array'
--                     AND al.details->'attendance_ids' @> to_jsonb(a.id::text)
--                     AND jsonb_typeof(al.details->'from_session_ids') = 'array'
--                     AND jsonb_array_length(al.details->'from_session_ids') > 0
--                     AND NOT EXISTS (
--                       SELECT 1 FROM jsonb_array_elements_text(al.details->'from_session_ids') f(id)
--                       WHERE NOT EXISTS (
--                         SELECT 1 FROM public.sessions s
--                         WHERE s.id::text = f.id AND s.modality = 'VIRTUAL'
--                       )
--                     )
--                   )
--                 )
--             )
--           )
--         )) AS attendances,
--     (SELECT count(*) FROM public.attendances a
--       WHERE
--         (
--           (a.ip_address IS NOT NULL AND a.ip_address <> 'manual')
--           OR a.latitude IS NOT NULL
--           OR a.longitude IS NOT NULL
--         )
--         AND NOT EXISTS (
--               SELECT 1 FROM public.sessions s
--               WHERE s.id = a.session_id AND s.modality = 'VIRTUAL'
--             )
--         AND (SELECT n.cnt FROM named n WHERE n.id = a.id::text) >= 2
--         AND EXISTS (
--             SELECT 1 FROM public.audit_log al
--             WHERE al.action = 'attendance.relocate'
--               AND (
--                 (
--                   al.entity_type = 'attendance'
--                   AND al.entity_id = a.id::text
--                   AND EXISTS (
--                     SELECT 1 FROM public.sessions s
--                     WHERE s.id::text = al.details->>'from_session_id'
--                       AND s.modality = 'VIRTUAL'
--                   )
--                 )
--                 OR (
--                   al.entity_type = 'session'
--                   AND jsonb_typeof(al.details->'attendance_ids') = 'array'
--                   AND al.details->'attendance_ids' @> to_jsonb(a.id::text)
--                   AND jsonb_typeof(al.details->'from_session_ids') = 'array'
--                   AND jsonb_array_length(al.details->'from_session_ids') > 0
--                   AND NOT EXISTS (
--                     SELECT 1 FROM jsonb_array_elements_text(al.details->'from_session_ids') f(id)
--                     WHERE NOT EXISTS (
--                       SELECT 1 FROM public.sessions s
--                       WHERE s.id::text = f.id AND s.modality = 'VIRTUAL'
--                     )
--                   )
--                 )
--               )
--           )) AS chained_rows_skipped,
--     (SELECT count(*) FROM public.sessions s
--       WHERE
--         s.modality = 'VIRTUAL'
--         AND (s.latitude IS NOT NULL OR s.longitude IS NOT NULL)) AS sessions,
--     (SELECT count(*) FROM public.audit_log al
--        CROSS JOIN public.sessions s
--       WHERE
--         al.action = 'attendance.relocate'
--         AND s.id::text = al.details->>'from_session_id'
--         AND s.modality = 'VIRTUAL'
--         AND al.details->>'original_ip_address' IS NOT NULL
--         AND al.details->>'original_ip_address' <> 'manual'
--         AND (
--           (SELECT n.cnt FROM named n WHERE n.id = al.entity_id) = 1
--           OR EXISTS (
--             SELECT 1 FROM public.attendances a
--             JOIN public.sessions cs ON cs.id = a.session_id
--             WHERE a.id::text = al.entity_id AND cs.modality = 'VIRTUAL'
--           )
--         )) AS audit_entries;
--
-- Queda fuera, por no estar ligado a una sesión: rate_limits guarda claves
-- 'scan:ip:<ip>' por ventana de un minuto y se purga sola (filas de más de
-- un día).
-- ============================================================

WITH named AS (
  SELECT r.id, count(*) AS cnt
  FROM (
    SELECT al.entity_id AS id
    FROM public.audit_log al
    WHERE al.action = 'attendance.relocate'
      AND al.entity_type = 'attendance'
    UNION ALL
    SELECT e.id
    FROM public.audit_log al
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(al.details->'attendance_ids') = 'array'
           THEN al.details->'attendance_ids' ELSE '[]'::jsonb END
    ) AS e(id)
    WHERE al.action = 'attendance.relocate'
      AND al.entity_type = 'session'
  ) r
  GROUP BY r.id
)
UPDATE public.attendances a
SET
  ip_address = CASE WHEN a.ip_address = 'manual' THEN a.ip_address ELSE NULL END,
  latitude = NULL,
  longitude = NULL
WHERE
  (
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
    -- b) nació en una clase virtual y se reubicó UNA sola vez
    OR (
      (SELECT n.cnt FROM named n WHERE n.id = a.id::text) = 1
      AND EXISTS (
        SELECT 1 FROM public.audit_log al
        WHERE al.action = 'attendance.relocate'
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
    )
  );

UPDATE public.sessions s
SET latitude = NULL, longitude = NULL
WHERE
  s.modality = 'VIRTUAL'
  AND (s.latitude IS NOT NULL OR s.longitude IS NOT NULL);

WITH named AS (
  SELECT r.id, count(*) AS cnt
  FROM (
    SELECT al.entity_id AS id
    FROM public.audit_log al
    WHERE al.action = 'attendance.relocate'
      AND al.entity_type = 'attendance'
    UNION ALL
    SELECT e.id
    FROM public.audit_log al
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(al.details->'attendance_ids') = 'array'
           THEN al.details->'attendance_ids' ELSE '[]'::jsonb END
    ) AS e(id)
    WHERE al.action = 'attendance.relocate'
      AND al.entity_type = 'session'
  ) r
  GROUP BY r.id
)
UPDATE public.audit_log al
SET details = al.details - 'original_ip_address'
FROM public.sessions s
WHERE
  al.action = 'attendance.relocate'
  AND s.id::text = al.details->>'from_session_id'
  AND s.modality = 'VIRTUAL'
  AND al.details->>'original_ip_address' IS NOT NULL
  AND al.details->>'original_ip_address' <> 'manual'
  AND (
    (SELECT n.cnt FROM named n WHERE n.id = al.entity_id) = 1
    OR EXISTS (
      SELECT 1 FROM public.attendances a
      JOIN public.sessions cs ON cs.id = a.session_id
      WHERE a.id::text = al.entity_id AND cs.modality = 'VIRTUAL'
    )
  );
