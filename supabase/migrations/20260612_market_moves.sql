-- Global cache of daily index % moves (Yahoo closes), used to anchor deterministic
-- "market move" highlights in the Diary around a user's mutation dates. Not user-
-- scoped — same global-reference-data shape as fx_rates: RLS enabled, no policies,
-- so only the service role (used server-side) can read/write.

CREATE TABLE IF NOT EXISTS public.market_moves (
  index_symbol  text NOT NULL,
  date          date NOT NULL,
  pct_change    numeric NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (index_symbol, date)
);

ALTER TABLE public.market_moves ENABLE ROW LEVEL SECURITY;
