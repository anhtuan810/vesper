-- Record the outstanding mortgage balance on a real-estate mutation so the
-- net-worth history can reconstruct equity at a PAST date using the balance in
-- effect then, not today's. Without it, a discrete lump-sum paydown (which drops
-- the stored balance) made every historical row before the paydown understate the
-- debt and overstate equity.
--
-- Nullable and additive: existing mutations stay NULL and the reconstruction
-- falls back to the amortisation schedule (its prior behaviour), so this is safe
-- to deploy before the column is applied and for all historical data.
ALTER TABLE mutations ADD COLUMN IF NOT EXISTS mortgage_balance numeric;
