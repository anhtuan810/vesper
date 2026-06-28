-- Per-user persisted "market swing" journal entries: a big index move (>=2%)
-- enriched with how the user's holdings moved that day, in their display currency.
-- Computed in the background (on data entry and by the daily cron) and served
-- instantly on read, so the diary/overview never wait on price/FX fetches.
--
-- One row per user per swing date (dedup by date is done at generation time).
-- Written and read only by the service role (server-side), same posture as
-- market_moves and fx_rates: RLS enabled with no policies.

CREATE TABLE IF NOT EXISTS public.market_swings (
  user_id       uuid NOT NULL,
  date          date NOT NULL,
  index_symbol  text NOT NULL,
  index_label   text NOT NULL,
  pct_change    numeric NOT NULL,
  total         numeric NOT NULL,        -- net portfolio day-change, display currency
  currency      text NOT NULL,           -- display currency the numbers are in
  movers        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{symbol,label,impact,pct}]
  expanded      boolean NOT NULL DEFAULT false,      -- full card vs compact row
  computed_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, date)
);

ALTER TABLE public.market_swings ENABLE ROW LEVEL SECURITY;
