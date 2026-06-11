-- Soft-delete marker for assets. When set, the asset is excluded from all
-- CURRENT-holdings reads (net worth, vitals, holdings, scenarios, Claude's
-- portfolio context) but the row and its mutation history remain intact, so
-- backfillSnapshots can still reconstruct it as held up to removed_at and
-- zero after (via the existing remove-mutation unit timeline). Hard delete
-- remains the active removal path for now; nothing writes this column yet.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS removed_at timestamptz;
