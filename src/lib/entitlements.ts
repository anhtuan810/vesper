// Server-only entitlement store. Reads/writes the `entitlements` table via the
// service role (RLS is owner-read only; clients never write here). Imported by
// the authed status endpoint and by both verified webhooks. Keep this off the
// client — it assumes service-role access.

import type { createServerSupabase } from "@/lib/supabase";
import {
  hasAccess,
  isEntitled,
  type PlanId,
  type SubscriptionSource,
  type SubscriptionStatus,
  type SubscriptionView,
} from "@/lib/subscription";

type ServiceClient = ReturnType<typeof createServerSupabase>;

// The `entitlements` row as stored.
export interface EntitlementRow {
  user_id: string;
  status: SubscriptionStatus;
  source: SubscriptionSource | null;
  plan: PlanId | null;
  current_period_end: string | null;
  trial_end: string | null;
  cancel_at_period_end: boolean;
  // The scheduled cancellation moment (Stripe `cancel_at` / store expiry when set to
  // cancel). The actual access-end date when cancelling — may precede the period end.
  cancel_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  revenuecat_app_user_id: string | null;
  product_id: string | null;
  // Source-event time of the last applied RevenueCat write — the ordering
  // watermark used to drop stale, out-of-order store events (see upsertEntitlement).
  revenuecat_event_at: string | null;
  updated_at: string;
  created_at: string;
}

// The normalized result of mapping a processor event to our entitlement. Both
// Stripe and RevenueCat mappers produce this; `upsertEntitlement` persists it.
export interface EntitlementWrite {
  userId: string;
  status: SubscriptionStatus;
  source: SubscriptionSource;
  plan: PlanId | null;
  currentPeriodEnd: string | null;
  trialEnd: string | null;
  cancelAtPeriodEnd: boolean;
  // Scheduled cancellation moment (ISO), set whenever cancelAtPeriodEnd is true.
  cancelAt?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  revenuecatAppUserId?: string | null;
  productId?: string | null;
  // Source-event timestamp (ISO), used to drop stale out-of-order store events.
  // Only the RevenueCat mapper sets it; Stripe re-reads current state instead.
  eventAt?: string | null;
}

const ENTITLEMENT_COLUMNS =
  "user_id, status, source, plan, current_period_end, trial_end, cancel_at_period_end, cancel_at, stripe_customer_id, stripe_subscription_id, revenuecat_app_user_id, product_id, revenuecat_event_at, updated_at, created_at";

export async function getEntitlement(
  supabase: ServiceClient,
  userId: string,
): Promise<EntitlementRow | null> {
  const { data, error } = await supabase
    .from("entitlements")
    .select(ENTITLEMENT_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`entitlements read failed: ${error.message}`);
  return (data as EntitlementRow | null) ?? null;
}

// Look up the owning user when a Stripe event carries no metadata (defensive).
export async function userIdByStripeCustomer(
  supabase: ServiceClient,
  customerId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("entitlements")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return (data as { user_id: string } | null)?.user_id ?? null;
}

export function toSubscriptionView(row: EntitlementRow | null): SubscriptionView {
  if (!row) {
    return {
      entitled: false,
      status: null,
      source: null,
      plan: null,
      currentPeriodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      isDemo: false,
    };
  }
  return {
    entitled: hasAccess(row.status, row.current_period_end),
    status: row.status,
    source: row.source,
    plan: row.plan,
    currentPeriodEnd: row.current_period_end,
    trialEnd: row.trial_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
    cancelAt: row.cancel_at,
    // The demo account is seeded with this sentinel product id (see demo-seed.ts).
    isDemo: row.product_id === "demo",
  };
}

// Records a processor event id so re-deliveries are no-ops. Returns true when the
// event is newly recorded (caller should process it) and false on a duplicate
// (caller should ack-and-skip). This is the idempotency primitive for both
// webhooks; insert-and-detect-conflict is atomic, so concurrent deliveries of
// the same event still process exactly once.
export async function markEventProcessed(
  supabase: ServiceClient,
  provider: "stripe" | "revenuecat",
  eventId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from("billing_events")
    .insert({ provider, event_id: eventId });
  if (!error) return true;
  // 23505 = unique_violation → this event was already processed.
  if ((error as { code?: string }).code === "23505") return false;
  throw new Error(`billing_events insert failed: ${error.message}`);
}

function processorRefs(w: EntitlementWrite): Record<string, string> {
  const refs: Record<string, string> = {};
  if (w.source === "stripe") {
    if (w.stripeCustomerId) refs.stripe_customer_id = w.stripeCustomerId;
    if (w.stripeSubscriptionId) refs.stripe_subscription_id = w.stripeSubscriptionId;
  } else {
    if (w.revenuecatAppUserId) refs.revenuecat_app_user_id = w.revenuecatAppUserId;
    // Advance the ordering watermark even on a cross-source ref-only write, so a
    // later stale store event for this user is still dropped.
    if (w.eventAt) refs.revenuecat_event_at = w.eventAt;
  }
  return refs;
}

// A foreign-key violation means the user row no longer exists — the account was
// deleted between the purchase and this (often store-renewal) webhook. There is
// nothing to write; ack-and-skip so the provider stops retrying instead of looping
// on a 500. Postgres code 23503 = foreign_key_violation.
function isMissingUser(error: { code?: string } | null): boolean {
  return error?.code === "23503";
}

// True when an incoming store event is strictly older than the last applied store
// event for this user, i.e. a stale, out-of-order delivery that must not overwrite
// newer state. Compares same-source only (store writes carry revenuecat_event_at;
// Stripe writes never touch it).
function isStaleStoreEvent(existing: EntitlementRow | null, w: EntitlementWrite): boolean {
  if (w.source === "stripe" || !w.eventAt || !existing?.revenuecat_event_at) return false;
  return new Date(w.eventAt).getTime() < new Date(existing.revenuecat_event_at).getTime();
}

// Persists an entitlement write into the user's single row (one active
// entitlement per user). Two safeguards keep cross-platform access correct:
//
//  1. Cross-source revoke guard — a non-active event from one processor must
//     never revoke an active entitlement owned by another platform (e.g. a
//     lapsed web trial must not lock out an active iOS subscriber). In that case
//     we keep access and only remember this processor's identifiers.
//  2. Identifier preservation — a write from one processor never nulls the other
//     processor's stored ids, so both remain reconcilable.
export async function upsertEntitlement(
  supabase: ServiceClient,
  w: EntitlementWrite,
): Promise<void> {
  const existing = await getEntitlement(supabase, w.userId);
  const incomingEntitled = isEntitled(w.status);

  // Ordering guard: a stale, out-of-order store event must never overwrite newer
  // state for the same user. Stripe is exempt (its webhook re-reads current state).
  if (isStaleStoreEvent(existing, w)) return;

  if (
    existing &&
    // Use the full access predicate, not isEntitled: a past_due subscriber still
    // inside the period they already paid for HAS access (hasAccess), so they must
    // be protected from a cross-source revoke exactly like an active one. isEntitled
    // alone (trialing/active) would leave a paying-grace subscriber on one platform
    // exposed to a lapsed/expired event from the other.
    hasAccess(existing.status, existing.current_period_end) &&
    !incomingEntitled &&
    existing.source &&
    existing.source !== w.source
  ) {
    const refs = processorRefs(w);
    if (Object.keys(refs).length === 0) return;
    const { error } = await supabase
      .from("entitlements")
      .update({ ...refs, updated_at: new Date().toISOString() })
      .eq("user_id", w.userId);
    if (isMissingUser(error)) return;
    if (error) throw new Error(`entitlements ref update failed: ${error.message}`);
    return;
  }

  const row = {
    user_id: w.userId,
    status: w.status,
    source: w.source,
    plan: w.plan,
    current_period_end: w.currentPeriodEnd,
    trial_end: w.trialEnd,
    cancel_at_period_end: w.cancelAtPeriodEnd,
    cancel_at: w.cancelAt ?? null,
    // Overwrite only this processor's ids; carry the other processor's forward.
    stripe_customer_id:
      w.source === "stripe" ? w.stripeCustomerId ?? null : existing?.stripe_customer_id ?? null,
    stripe_subscription_id:
      w.source === "stripe" ? w.stripeSubscriptionId ?? null : existing?.stripe_subscription_id ?? null,
    revenuecat_app_user_id:
      w.source !== "stripe" ? w.revenuecatAppUserId ?? null : existing?.revenuecat_app_user_id ?? null,
    product_id: w.productId ?? existing?.product_id ?? null,
    // Advance the store ordering watermark on store writes; carry it forward on
    // Stripe writes so a later out-of-order store event is still comparable.
    revenuecat_event_at:
      w.source !== "stripe" ? w.eventAt ?? existing?.revenuecat_event_at ?? null : existing?.revenuecat_event_at ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("entitlements")
    .upsert(row, { onConflict: "user_id" });
  if (isMissingUser(error)) return;
  if (error) throw new Error(`entitlements upsert failed: ${error.message}`);
}
