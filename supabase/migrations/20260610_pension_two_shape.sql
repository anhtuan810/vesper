-- Pension two-shape columns. Idempotent: documents the columns the chat intake
-- and write path already populate (pension_kind, annual_income,
-- monthly_contribution, access_age, pension_provider) and constrains
-- pension_kind to the valid shapes. Safe to re-run; matches the live schema.
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pension_kind text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS annual_income numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS monthly_contribution numeric;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS access_age int;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS pension_provider text;
ALTER TABLE assets DROP CONSTRAINT IF EXISTS pension_kind_valid;
ALTER TABLE assets ADD CONSTRAINT pension_kind_valid
  CHECK (pension_kind IS NULL OR pension_kind IN ('dc','db','state'));
