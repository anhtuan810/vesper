-- Scheduled-cancellation moment for the entitlement.
--
-- In the pinned Stripe API version (2026-05-27.dahlia) a billing-portal
-- "cancel at period end" is recorded as a `cancel_at` timestamp rather than the
-- legacy `cancel_at_period_end` boolean (which stays false). This column stores that
-- moment (and the store equivalent for RevenueCat — access runs until expiry), so
-- the Profile can show the real access-end date, which may precede the period/trial
-- end, instead of the period end.
--
-- Nullable and additive; existing rows keep NULL (not cancelling). The cancel state
-- itself is still derived in the mapper (cancel_at_period_end OR cancel_at present),
-- so this column only sharpens the displayed date.

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS cancel_at timestamptz;
