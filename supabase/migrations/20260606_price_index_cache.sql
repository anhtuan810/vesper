-- Regional CBS PBK (Prijsindex Bestaande Koopwoningen) index series cache.
-- Keyed by the resolved CBS RegioS code; one yearly series per region. Refreshed
-- by /api/property-estimate when fetched_at is older than ~30 days (PBK is
-- quarterly). Region-level (not user) data, written only via the service role;
-- reads/writes in code are best-effort (a missing row degrades to a live fetch).

CREATE TABLE IF NOT EXISTS price_index_cache (
  region_code   text PRIMARY KEY,
  points        jsonb NOT NULL DEFAULT '[]'::jsonb,
  as_of_period  text,
  fetched_at    timestamptz NOT NULL DEFAULT now()
);
