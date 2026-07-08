-- Global cache of per-date USD→quote FX rates (Frankfurter time-series). The
-- persistent, cross-instance companion to the in-memory `histMemCache` in fx.ts.
-- The net-worth history backfill and the Diary market-swing computation each fetch
-- a multi-year daily FX series to convert historical values at the rate for their
-- own date; on a cold serverless instance both re-fetch it from Frankfurter, and
-- they use different date ranges so they don't even share the in-memory memo.
--
-- Not user-scoped: a date's FX rate is the same for everyone. Same global-reference
-- shape as fx_rates / market_moves / price_history: RLS enabled, no policies, so only
-- the service role (used server-side) can read/write. Best-effort in code — a missing
-- table or row degrades to a live Frankfurter fetch (`getHistoricalUsdRates`), so it
-- is safe to deploy before this SQL is applied. Historical rates are immutable, so
-- only the most recent few days are ever re-fetched. `base` is always USD (implied).

CREATE TABLE IF NOT EXISTS public.fx_rate_history (
  date        date NOT NULL,
  quote       text NOT NULL,
  rate        numeric NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, quote)
);

ALTER TABLE public.fx_rate_history ENABLE ROW LEVEL SECURITY;
