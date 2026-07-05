-- Repair bonds stored under the non-canonical singular type "bond".
--
-- Cause: the agent-loop chat tool schema (src/lib/chat/agent-tools.ts
-- CHANGE_ITEM_SCHEMA) advertised the asset `type` enum with the SINGULAR "bond",
-- and the write path (src/lib/apply-changes.ts) stored `change.type` verbatim.
-- Every other part of the app keys on the canonical PLURAL "bonds"
-- (BondsAsset.type = "bonds"): the asset-detail router, category map, type
-- labels, asset logo, and the leverage / liquidity vitals. A bond added through
-- chat therefore persisted as type="bond" and:
--   - 404'd on its asset-detail page (no routing branch matched),
--   - lost its bond certificate icon (fell back to a text monogram),
--   - was mis-tiered in Liquidity Posture (6mo+ instead of 1mo),
--   - was dropped from the Leverage portfolio-yield coupon sum.
--
-- The code fix (schema now emits "bonds"; apply-changes normalizes "bond" ->
-- "bonds" before insert) stops NEW bad rows. This migration repairs rows written
-- before that fix — the assets themselves and their mutation audit rows.
--
-- Idempotent: a second run matches nothing (no "bond" rows remain).

UPDATE assets    SET type       = 'bonds' WHERE type       = 'bond';
UPDATE mutations SET asset_type = 'bonds' WHERE asset_type = 'bond';
