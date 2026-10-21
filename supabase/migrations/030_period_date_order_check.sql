-- ============================================================
-- 030: la fecha de fin de un periodo debe ser posterior a la de inicio
-- ============================================================
-- La app ya lo validaba (cliente y server actions de academic.ts),
-- pero la base no lo impedia: el periodo "2026-2" llego a produccion
-- con inicio 2026-08-30 y fin 2026-06-02, lo que dejaba sin funcionar
-- los cortes y la deteccion de clases no registradas. Con este CHECK
-- ningun camino (otra version de la app, un script, el SQL editor)
-- puede volver a guardar un rango invertido.
--
-- Fechas opcionales: si falta alguna de las dos, no hay nada que
-- comparar. Idempotente.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'periods_dates_order' AND conrelid = 'public.periods'::regclass
  ) THEN
    ALTER TABLE public.periods
      ADD CONSTRAINT periods_dates_order
      CHECK (start_date IS NULL OR end_date IS NULL OR start_date < end_date);
  END IF;
END $$;
