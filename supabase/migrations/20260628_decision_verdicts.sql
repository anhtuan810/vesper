-- Decision Verdict cache. The verdict for a past decision is computed from live
-- Yahoo prices + FX on every selection, which adds a visible delay. The figure is
-- stable except for the slow daily drift of the "now" value, so we compute it once
-- and serve it from here, refreshing when the cached row is from an earlier day.
--
-- Keyed by CONTENT (mode:symbol:date:units:currency), not the mutation id, so the
-- cache survives the per-entry demo reseed (which mints new mutation ids for the
-- same trades) and is shared across users who made the same trade. One row per
-- distinct decision, refreshed in place — bounded and self-maintaining.
--
-- Service-role only (the verdict route uses the service client); RLS on, no
-- policies. Code degrades gracefully until this is applied: a missing table just
-- means every verdict is computed live, exactly as before.
create table if not exists decision_verdicts (
  verdict_key text primary key,
  computed_on date not null,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table decision_verdicts enable row level security;
