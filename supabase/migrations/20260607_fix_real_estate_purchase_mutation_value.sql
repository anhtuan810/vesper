-- Repair stale cost-basis on property "add" mutations.
--
-- Cause: between commits 399256f (2026-06-03) and c52eaf9 (2026-06-04), the
-- property-add path in src/lib/apply-changes.ts stamped the purchase mutation's
-- `after_value` with the indicative *current* estimate (CBS PBK regional value)
-- instead of the entered `buy_price`. The asset's `buy_price` was stored
-- correctly, so the activity row ("Bought <amount>") diverged from the real
-- purchase price (e.g. it showed the ~current estimate ~EUR 424,684 while the
-- true purchase was EUR 200,000).
--
-- The creation path is already fixed in c52eaf9 (after_value now = buy_price for
-- properties with a known purchase price). This migration only repairs rows
-- written before that fix; no application or schema changes are involved.
--
-- Scope: exactly the bug signature — real_estate "add" mutations whose
-- personal_context is the indicative-estimate provenance note, joined to an asset
-- that has a usable buy_price, and only where after_value still differs. This
-- makes the statement idempotent: a second run matches nothing.

UPDATE mutations m
SET after_value = a.buy_price
FROM assets a
WHERE m.asset_id = a.id
  AND m.action = 'add'
  AND m.asset_type = 'real_estate'
  AND m.personal_context LIKE 'Initial value set from indicative regional estimate%'
  AND a.buy_price IS NOT NULL AND a.buy_price > 0
  AND m.after_value <> a.buy_price;
