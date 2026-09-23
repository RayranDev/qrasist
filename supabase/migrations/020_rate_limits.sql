-- ============================================================
-- MIGRACION: Rate limiter respaldado por Postgres
--
-- El rate limiter anterior (rateLimiter.ts) vivia en un Map en
-- memoria del proceso Node -- en Vercel serverless cada invocacion
-- puede caer en una instancia distinta (o una instancia fria), asi
-- que el limite nunca se compartia entre requests reales y era
-- inutil en produccion.
--
-- Esta migracion mueve el contador a una tabla + funcion atomica:
-- el backend llama a check_rate_limit() via el cliente service-role,
-- y la funcion hace un upsert atomico sobre la ventana actual.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_start)
);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- A proposito no se crea ninguna policy: sin policies, ni anon ni
-- authenticated tienen ninguna via de acceso (ni siquiera lectura).
-- Solo el service_role -- que bypassa RLS -- puede tocar esta tabla,
-- y en la practica solo lo hace a traves de check_rate_limit().

-- Ventana fija (fixed window counter): agrupa los intentos en
-- bloques de p_window_seconds y cuenta cuantos cayeron en el bloque
-- actual. El INSERT ... ON CONFLICT DO UPDATE es atomico, asi que
-- dos requests concurrentes para la misma key nunca pisan el
-- conteo del otro.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key TEXT,
  p_max INT,
  p_window_seconds INT
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count INT;
BEGIN
  v_window_start := to_timestamp(
    floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limits (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = public.rate_limits.count + 1
  RETURNING count INTO v_count;

  -- Limpieza oportunista de filas viejas (>1 dia). Se dispara con
  -- baja probabilidad para no pagar el costo de un DELETE en cada
  -- llamada -- no es critico que corra siempre, solo que corra
  -- eventualmente y la tabla no crezca sin limite.
  IF random() < 0.01 THEN
    DELETE FROM public.rate_limits WHERE window_start < now() - INTERVAL '1 day';
  END IF;

  RETURN v_count <= p_max;
END;
$$;

-- Nadie mas que el service_role deberia poder llamar esto: anon o
-- authenticated ejecutando check_rate_limit() a mano podrian inflar
-- o pisar el contador de otra key.
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INT, INT) TO service_role;
