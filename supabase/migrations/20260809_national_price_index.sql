-- Global cache of NATIONAL house-price index series (Eurostat prc_hpi_a: annual
-- House Price Index, all dwellings, index 2015 = 100), one yearly series per
-- country. Seeded by the /api/cron/warm-price-index cron so the net-worth history
-- reconstruction never fetches it live on the hot path — it reads this table
-- keyed by the property's country (no geocoding needed at the national tier).
--
-- Not user-scoped: a country's national index is the same for everyone. Same
-- global-reference shape as price_index_cache / fx_rate_history / market_moves:
-- RLS enabled, no policies, so only the service role (used server-side) can
-- read/write. Best-effort in code — a missing table or row degrades to the
-- linear fallback (a straight buy→today line), so it is SAFE TO DEPLOY BEFORE
-- this SQL is applied and before the cron has run: nothing regresses, property
-- history just stays linear (its pre-national behavior) until the seed lands.
-- `country` is an ISO-2 code (NL, DE, US, …). Index values are immutable per
-- year, so a re-seed only refreshes the tail.

CREATE TABLE IF NOT EXISTS public.national_price_index (
  country     text PRIMARY KEY,
  points      jsonb NOT NULL DEFAULT '[]'::jsonb,
  as_of_year  int,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.national_price_index ENABLE ROW LEVEL SECURITY;
