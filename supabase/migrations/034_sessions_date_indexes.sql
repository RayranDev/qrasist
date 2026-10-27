-- The admin attendance calendar and the date-range attendance report filter
-- sessions by a timestamptz window (date >= start AND date < end), alone or
-- together with subject_id. sessions had no index on date, so those queries
-- would scan the whole table as the history grows.

CREATE INDEX IF NOT EXISTS idx_sessions_date
  ON public.sessions (date);

CREATE INDEX IF NOT EXISTS idx_sessions_subject_id_date
  ON public.sessions (subject_id, date);
