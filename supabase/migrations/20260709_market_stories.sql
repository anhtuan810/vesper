-- Global cache of the "story behind" an auto-logged market swing: one short,
-- search-grounded sentence explaining WHY a symbol moved on a given date (e.g.
-- "Prices slid as the Fed signalled rates would stay higher for longer.").
--
-- Not user-scoped: the reason a market or a held asset moved on a date is the
-- SAME for everyone, so one row per (date, symbol) serves all users — the same
-- global-reference-data shape as price_history / fx_rate_history / market_moves.
-- The swing entries themselves (market_swings) stay per-user; the read path joins
-- this story in by (date, index_symbol) at request time.
--
--   • A row's EXISTENCE means "we already looked this up" — so it's never queried
--     again. `story` NULL means we looked and found no confident cause (a noisy
--     day with no clean single reason); such days keep the plain templated entry
--     and are not retried. `story` non-NULL is the sentence to show.
--   • A row is written ONLY after a completed lookup. A transient failure writes
--     nothing, so it's retried on a later view/cron — a failure is never cached
--     as "no story".
--
-- Best-effort in code — a missing table (before this SQL is applied) or any read
-- error degrades to the existing behaviour (entries render without a story), so
-- this is safe to DEPLOY BEFORE APPLYING. Stories are generated in the background
-- (off the request hot path), so the rebuild that computes swings never waits on
-- an LLM/web-search call and does not get slower.
--
-- Service-role only (RLS enabled, no policies) — same posture as market_moves,
-- fx_rates, price_history and market_swings.

CREATE TABLE IF NOT EXISTS public.market_stories (
  date        date NOT NULL,
  symbol      text NOT NULL,
  story       text,            -- NULL = looked up, no confident cause (don't retry, don't show)
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (date, symbol)
);

ALTER TABLE public.market_stories ENABLE ROW LEVEL SECURITY;
