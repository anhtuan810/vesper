// Server-only entitlement store. Reads/writes the `entitlements` table via the
// service role (RLS is owner-read only; clients never write here). Imported by
// the authed status endpoint and by both verified webhooks. Keep this off the
// client — it assumes service-role access.

import type { createServerSupabase } from "@/lib/supabase";
import {
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
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  revenuecat_app_user_id: string | null;
  product_id: string | null;
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
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  revenuecatAppUserId?: string | null;
  productId?: string | null;
}

const ENTITLEMENT_COLUMNS =
  "user_id, status, source, plan, current_period_end, trial_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, revenuecat_app_user_id, product_id, updated_at, created_at";

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
    };
  }
  return {
    entitled: isEntitled(row.status),
    status: row.status,
    source: row.source,
    plan: row.plan,
    currentPeriodEnd: row.current_period_end,
    trialEnd: row.trial_end,
    cancelAtPeriodEnd: row.cancel_at_period_end,
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
  } else if (w.revenuecatAppUserId) {
    refs.revenuecat_app_user_id = w.revenuecatAppUserId;
  }
  return refs;
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

  if (
    existing &&
    isEntitled(existing.status) &&
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
    // Overwrite only this processor's ids; carry the other processor's forward.
    stripe_customer_id:
      w.source === "stripe" ? w.stripeCustomerId ?? null : existing?.stripe_customer_id ?? null,
    stripe_subscription_id:
      w.source === "stripe" ? w.stripeSubscriptionId ?? null : existing?.stripe_subscription_id ?? null,
    revenuecat_app_user_id:
      w.source !== "stripe" ? w.revenuecatAppUserId ?? null : existing?.revenuecat_app_user_id ?? null,
    product_id: w.productId ?? existing?.product_id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("entitlements")
    .upsert(row, { onConflict: "user_id" });
  if (error) throw new Error(`entitlements upsert failed: ${error.message}`);
}
