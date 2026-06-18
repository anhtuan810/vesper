// Server-only Stripe helpers: a lazily-created client (so a missing key never
// breaks the build, only a runtime call), env-driven price IDs, and the mapping
// from a Stripe subscription to our entitlement. Never import this on the client
// — it pulls in the `stripe` SDK and reads the secret key.

import Stripe from "stripe";
import type { PlanId, SubscriptionStatus } from "@/lib/subscription";
import type { EntitlementWrite } from "@/lib/entitlements";

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!client) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
    // No apiVersion pin: use the SDK's bundled version so types and payloads agree.
    client = new Stripe(key);
  }
  return client;
}

export function stripePriceId(plan: PlanId): string {
  const id = plan === "annual" ? process.env.STRIPE_PRICE_ANNUAL : process.env.STRIPE_PRICE_MONTHLY;
  if (!id) throw new Error(`Stripe price id for the ${plan} plan is not set`);
  return id;
}

export function planForStripePrice(priceId: string | null | undefined): PlanId | null {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_ANNUAL) return "annual";
  if (priceId === process.env.STRIPE_PRICE_MONTHLY) return "monthly";
  return null;
}

function mapStripeStatus(s: Stripe.Subscription.Status): SubscriptionStatus {
  switch (s) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "paused":
      return "canceled";
    case "incomplete_expired":
      return "expired";
    case "incomplete":
    default:
      return "incomplete";
  }
}

const toIso = (unix: number | null | undefined): string | null =>
  unix ? new Date(unix * 1000).toISOString() : null;

// `current_period_end` moved from the subscription onto each item in newer Stripe
// API versions; read whichever is present so the renewal date survives upgrades.
function periodEndUnix(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  const fromSub = (sub as unknown as { current_period_end?: number }).current_period_end;
  return item?.current_period_end ?? fromSub ?? null;
}

// The Supabase user id stamped onto the subscription at checkout
// (subscription_data.metadata.supabase_user_id). Every purchase maps to an account.
export function userIdFromStripeSubscription(sub: Stripe.Subscription): string | null {
  const v = sub.metadata?.supabase_user_id;
  return typeof v === "string" && v ? v : null;
}

export function mapStripeSubscription(sub: Stripe.Subscription, userId: string): EntitlementWrite {
  const priceId = sub.items?.data?.[0]?.price?.id ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null;
  return {
    userId,
    status: mapStripeStatus(sub.status),
    source: "stripe",
    plan: planForStripePrice(priceId),
    currentPeriodEnd: toIso(periodEndUnix(sub)),
    trialEnd: toIso(sub.trial_end),
    // "Cancel at period end" via the billing portal is represented in this Stripe
    // API version (2026-05-27.dahlia) as a scheduled `cancel_at` timestamp, NOT the
    // legacy `cancel_at_period_end` boolean (which stays false). The Dashboard's
    // "Cancels <date>" badge reflects `cancel_at`. Treat either as a pending
    // cancellation so the entitlement mirrors what Stripe actually shows; clicking
    // "Don't cancel" clears both, flipping this back to false.
    cancelAtPeriodEnd: sub.cancel_at_period_end === true || sub.cancel_at != null,
    stripeCustomerId: customerId,
    stripeSubscriptionId: sub.id,
    productId: priceId,
  };
}

// Of a customer's subscriptions, the one that best represents current access: an
// entitling one (trialing/active) first, otherwise the most recently created, so a
// reconcile reflects what the user actually holds at Stripe.
function pickSubscription(subs: Stripe.Subscription[]): Stripe.Subscription | null {
  if (subs.length === 0) return null;
  const entitling = subs.find((s) => s.status === "trialing" || s.status === "active");
  return entitling ?? subs.slice().sort((a, b) => b.created - a.created)[0];
}

// Fallback used when our DB shows no access but the user may actually have paid —
// e.g. the checkout webhook was missed, delayed, or never configured, which would
// otherwise strand a paying user behind the paywall. Looks the user up at Stripe by
// their known customer id (preferred) and/or email (immediately consistent, unlike
// Search, so a just-completed checkout is found) and returns the mapped entitlement
// for their current subscription — but only when it actually grants access now
// (trialing/active/past_due), so a stale canceled sub never gets recorded in a way
// that blocks a later re-subscribe from healing. Returns null when there is nothing
// that grants access.
export async function findStripeEntitlement(
  userId: string,
  opts: { customerId?: string | null; email?: string | null },
): Promise<EntitlementWrite | null> {
  const stripe = getStripe();
  const customerIds: string[] = [];
  if (opts.customerId) customerIds.push(opts.customerId);
  if (opts.email) {
    const customers = await stripe.customers.list({ email: opts.email, limit: 10 });
    for (const c of customers.data) if (!customerIds.includes(c.id)) customerIds.push(c.id);
  }
  for (const customerId of customerIds) {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const sub = pickSubscription(subs.data);
    if (!sub) continue;
    const write = mapStripeSubscription(sub, userId);
    if (write.status === "trialing" || write.status === "active" || write.status === "past_due") {
      return write;
    }
  }
  return null;
}

// Cancels a subscription immediately as part of account deletion, so a deleted
// account is never billed again. No proration and no refund — cancellation only
// stops future charges. Idempotent: a subscription that no longer exists at
// Stripe, or is already in a terminal state, is treated as success. Throws only
// on a genuine API failure, so the caller can block deletion and retry rather
// than silently orphaning a live, still-billing subscription.
export async function cancelStripeSubscription(subscriptionId: string): Promise<void> {
  const stripe = getStripe();
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(subscriptionId);
  } catch (err) {
    // The subscription no longer exists at Stripe — nothing left to bill.
    if ((err as { code?: string }).code === "resource_missing") return;
    throw err;
  }
  // Already terminal (canceled/expired) — no further billing will occur.
  if (sub.status === "canceled" || sub.status === "incomplete_expired") return;
  await stripe.subscriptions.cancel(subscriptionId);
}

// Deletes the Stripe customer as part of account deletion, so the customer's PII
// (email) does not linger at Stripe after the account is gone (GDPR erasure) and a
// later re-signup with the same email doesn't accumulate duplicate customers.
// Deleting a customer also cancels its subscriptions, so this is the belt to the
// cancel above. Idempotent: a customer that no longer exists is treated as success.
// Throws only on a genuine API failure, so the caller can block deletion and retry.
export async function deleteStripeCustomer(customerId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.customers.del(customerId);
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return;
    throw err;
  }
}
