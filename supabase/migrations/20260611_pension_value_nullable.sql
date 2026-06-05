-- Fix: income pensions (pension_kind 'db' | 'state') are a future-income
-- entitlement with no owned balance, so the write path stores value = NULL
-- (off-balance; excluded from net worth everywhere by pension_kind). The base
-- `assets` table declared `value NOT NULL`, which rejected those inserts — the
-- chat add surfaced "Couldn't record <name> — please try that one again."
--
-- Make `value` nullable. This file is idempotent and also re-asserts the
-- pension columns + constraint, so running it brings any environment current
-- in one paste regardless of which earlier migration was applied.
ALTER TABLE assets ALTER COLUMN value DROP NOT NULL;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS pension_kind text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS annual_income numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS monthly_contribution numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS access_age int;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pension_provider text;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS pension_kind_valid;
ALTER TABLE assets ADD CONSTRAINT pension_kind_valid
  CHECK (pension_kind IS NULL OR pension_kind IN ('dc','db','state'));
