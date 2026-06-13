-- Cross-platform subscription entitlement — the single source of truth for paid
-- access. Keyed to the Supabase user ACCOUNT (never a device or platform), so a
-- user who subscribes on any platform has full access on all of them. One row
-- per user (PK user_id) enforces one active entitlement per user.
--
-- Two writers, both via signature/auth-verified webhooks, each matched to the
-- Supabase user id: Stripe (web) and RevenueCat (mobile). Writes use the service
-- role only — clients can never write their own entitlement. The row is never
-- hard-deleted on cancellation (status moves to canceled/expired); it is removed
-- only with the account (ON DELETE CASCADE, plus an explicit delete in
-- DELETE /api/users/me).
--
-- Per-user table conventions match the existing ones (e.g. scenarios, rate_limits):
-- user_id FK to users(id) ON DELETE CASCADE, RLS scoped by auth.uid() = user_id.

CREATE TABLE IF NOT EXISTS public.entitlements (
  user_id                 uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  -- Resolved access state. 'trialing' and 'active' grant access; the rest don't.
  status                  text NOT NULL DEFAULT 'incomplete'
                            CHECK (status IN ('trialing','active','past_due','canceled','expired','incomplete')),
  -- Which processor/store owns the current entitlement — drives the Profile
  -- "Manage" destination. 'stripe' = web; 'app_store' = iOS; 'play_store' = Android.
  source                  text CHECK (source IN ('stripe','app_store','play_store')),
  -- Billing cadence the user is on (or will be charged at trial end).
  plan                    text CHECK (plan IN ('monthly','annual')),
  -- Renewal date for active subscriptions / expiry date for canceled ones (UTC).
  current_period_end      timestamptz,
  trial_end               timestamptz,
  -- True when the subscription will not auto-renew at period end.
  cancel_at_period_end    boolean NOT NULL DEFAULT false,
  -- Processor references for reconciliation (never trusted from the client).
  stripe_customer_id      text,
  stripe_subscription_id  text,
  revenuecat_app_user_id  text,
  product_id              text,
  updated_at              timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now()
);

-- Owner-only read (RLS). All writes use the service role, which bypasses RLS, so
-- there are deliberately no INSERT/UPDATE/DELETE policies — a client can read its
-- own entitlement but never forge one.
ALTER TABLE public.entitlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entitlements_owner_select" ON public.entitlements
  FOR SELECT
  USING (auth.uid() = user_id);

-- Reverse lookups when a Stripe event must be matched back to a user without our
-- metadata (defensive fallback in the webhook).
CREATE INDEX IF NOT EXISTS entitlements_stripe_customer_idx
  ON public.entitlements (stripe_customer_id);
CREATE INDEX IF NOT EXISTS entitlements_stripe_subscription_idx
  ON public.entitlements (stripe_subscription_id);

-- Webhook idempotency ledger. Each processor event id is recorded exactly once;
-- a replay collides on the primary key and is skipped, so re-delivered webhooks
-- never double-apply. Server-only (service role): RLS enabled with no policies.
-- Global (not user-scoped) and intentionally retained across account deletion as
-- a replay/audit guard.
CREATE TABLE IF NOT EXISTS public.billing_events (
  provider    text NOT NULL CHECK (provider IN ('stripe','revenuecat')),
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
