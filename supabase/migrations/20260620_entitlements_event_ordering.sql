-- Webhook event-ordering guard for the mobile (RevenueCat) writer.
--
-- Providers do not guarantee delivery order, and retries can deliver an older
-- event after a newer one (e.g. a stale RENEWAL arriving after an EXPIRATION),
-- which would otherwise revert the entitlement to a stale state. This column
-- records the source-event time of the last applied RevenueCat write so the
-- upsert can drop a strictly-older store event for the same user.
--
-- Stripe needs no equivalent column: its webhook re-reads the subscription fresh
-- from the API on every event, so it always applies current state regardless of
-- delivery order (see src/app/api/webhooks/stripe/route.ts).
--
-- Nullable and additive; existing rows keep NULL (treated as "no watermark yet",
-- so the first event after this migration always applies).

ALTER TABLE public.entitlements
  ADD COLUMN IF NOT EXISTS revenuecat_event_at timestamptz;
