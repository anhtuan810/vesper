-- Adds ASSET swings (a held asset's own big single-day move) alongside the
-- existing INDEX swings in market_swings. Both kinds are computed together,
-- tagged by `kind`, and persisted in this one table. index_symbol/index_label/
-- pct_change carry the headline in both cases (the index for "index", the asset
-- for "asset").
--
-- An index swing and an asset swing can fall on the SAME date for a user (a big
-- market day is often also a big day for a volatile holding), so the primary key
-- widens from (user_id, date) to (user_id, date, kind) — otherwise the second
-- row of the day would collide.
--
-- Safe to apply anytime, and safe to DEPLOY BEFORE APPLYING: until it runs, the
-- SELECT/insert of `kind` errors, which is already caught — the read path falls
-- back to computing swings live (getDiaryMarketMoves), so asset swings still
-- appear, just uncached. Once applied, caching resumes for both kinds.
--
-- Service-role only (RLS enabled, no policies) — same posture as the base table.

ALTER TABLE public.market_swings
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'index'
    CHECK (kind IN ('index', 'asset'));

ALTER TABLE public.market_swings DROP CONSTRAINT IF EXISTS market_swings_pkey;
ALTER TABLE public.market_swings ADD PRIMARY KEY (user_id, date, kind);
