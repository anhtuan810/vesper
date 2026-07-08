-- Global cache of daily closing prices per symbol (Yahoo closes). The persistent,
-- cross-instance backing for the warm-instance price memo in snapshot.ts. Reused by
-- the net-worth history backfill, the named-rewind holdings reconstruction, and the
-- Diary market-swing computation — all of which need a symbol's full historical
-- daily series and today each re-fetch it from Yahoo on a cold serverless instance.
--
-- Not user-scoped: a symbol's closes are the same for everyone, so one row per
-- (symbol, date) serves all users. Same global-reference-data shape as market_moves
-- / fx_rates: RLS enabled, no policies, so only the service role (used server-side)
-- can read/write. Best-effort in code — a missing table or row degrades to a live
-- Yahoo fetch (the pre-cache behaviour), so it is safe to deploy before this SQL is
-- applied. Historical closes are immutable, so only the most recent few days are
-- ever re-fetched; the deep history is fetched once and reused forever.

CREATE TABLE IF NOT EXISTS public.price_history (
  symbol      text NOT NULL,
  date        date NOT NULL,
  price       numeric NOT NULL,
  currency    text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, date)
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
