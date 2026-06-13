// Self-test for the pure subscription mapping logic (no I/O, no network, no DB).
// Covers the entitled-status rule, the Stripe and RevenueCat event -> entitlement
// mappings, plan resolution, and the rejection of input that must not grant
// access. Run:  npx tsx scripts/verify-entitlement-mapping.ts

// Env the mappers read at call time. Set before importing nothing problematic —
// the mappers read process.env when invoked, so this is sufficient.
process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
process.env.STRIPE_PRICE_ANNUAL = "price_annual";
process.env.REVENUECAT_MONTHLY_PRODUCT_ID = "rc_monthly";
process.env.REVENUECAT_ANNUAL_PRODUCT_ID = "rc_annual";
process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID = "premium";

import type Stripe from "stripe";
import { isEntitled } from "../src/lib/subscription";
import {
  mapStripeSubscription,
  planForStripePrice,
  userIdFromStripeSubscription,
} from "../src/lib/stripe";
import { mapRevenueCatEvent, type RevenueCatEvent } from "../src/lib/revenuecat-webhook";

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    console.log("ok:", msg);
  } else {
    console.error("FAIL:", msg);
    failures++;
  }
}

const USER = "11111111-1111-4111-8111-111111111111";
const future = Date.now() + 30 * 86_400_000;
const past = Date.now() - 86_400_000;

// ── Entitled-status rule ───────────────────────────────────────────────────────
assert(isEntitled("trialing"), "trialing is entitled");
assert(isEntitled("active"), "active is entitled");
assert(!isEntitled("past_due"), "past_due is not entitled");
assert(!isEntitled("canceled"), "canceled is not entitled");
assert(!isEntitled("expired"), "expired is not entitled");
assert(!isEntitled(null), "null is not entitled");

// ── Stripe price -> plan ───────────────────────────────────────────────────────
assert(planForStripePrice("price_monthly") === "monthly", "Stripe monthly price -> monthly");
assert(planForStripePrice("price_annual") === "annual", "Stripe annual price -> annual");
assert(planForStripePrice("price_unknown") === null, "unknown Stripe price -> null plan");

// ── Stripe subscription -> entitlement ─────────────────────────────────────────
function stripeSub(over: Record<string, unknown>): Stripe.Subscription {
  return {
    id: "sub_1",
    status: "active",
    customer: "cus_1",
    cancel_at_period_end: false,
    trial_end: null,
    items: { data: [{ price: { id: "price_monthly" }, current_period_end: Math.floor(future / 1000) }] },
    metadata: { supabase_user_id: USER },
    ...over,
  } as unknown as Stripe.Subscription;
}

const sActive = mapStripeSubscription(stripeSub({}), USER);
assert(sActive.status === "active" && sActive.source === "stripe", "Stripe active -> active/stripe");
assert(sActive.plan === "monthly", "Stripe active monthly price -> monthly plan");
assert(sActive.currentPeriodEnd !== null && !Number.isNaN(Date.parse(sActive.currentPeriodEnd)), "Stripe period end is a valid ISO date");
assert(sActive.stripeSubscriptionId === "sub_1" && sActive.stripeCustomerId === "cus_1", "Stripe ids carried through");

const sTrial = mapStripeSubscription(
  stripeSub({ status: "trialing", trial_end: Math.floor(future / 1000), items: { data: [{ price: { id: "price_annual" }, current_period_end: Math.floor(future / 1000) }] } }),
  USER,
);
assert(sTrial.status === "trialing" && sTrial.plan === "annual" && sTrial.trialEnd !== null, "Stripe trialing annual -> trialing/annual with trialEnd");

const sCanceled = mapStripeSubscription(stripeSub({ status: "canceled" }), USER);
assert(sCanceled.status === "canceled", "Stripe canceled -> canceled");

const sPastDue = mapStripeSubscription(stripeSub({ status: "past_due" }), USER);
assert(sPastDue.status === "past_due", "Stripe past_due -> past_due");

assert(userIdFromStripeSubscription(stripeSub({})) === USER, "Stripe metadata user id extracted");
assert(userIdFromStripeSubscription(stripeSub({ metadata: {} })) === null, "Stripe without metadata -> null user id");

// ── RevenueCat event -> entitlement ────────────────────────────────────────────
function rcEvent(over: Partial<RevenueCatEvent>): RevenueCatEvent {
  return {
    id: "evt_1",
    type: "INITIAL_PURCHASE",
    app_user_id: USER,
    product_id: "rc_annual",
    entitlement_ids: ["premium"],
    period_type: "NORMAL",
    expiration_at_ms: future,
    store: "APP_STORE",
    environment: "PRODUCTION",
    ...over,
  };
}

const rcInitial = mapRevenueCatEvent(rcEvent({}));
assert(rcInitial?.status === "active" && rcInitial?.source === "app_store", "RC initial purchase -> active/app_store");
assert(rcInitial?.plan === "annual", "RC annual product -> annual plan");

const rcTrial = mapRevenueCatEvent(rcEvent({ period_type: "TRIAL", product_id: "rc_monthly" }));
assert(rcTrial?.status === "trialing" && rcTrial?.plan === "monthly", "RC trial -> trialing/monthly");
assert(rcTrial?.trialEnd !== null, "RC trial sets trialEnd");

const rcExpired = mapRevenueCatEvent(rcEvent({ type: "EXPIRATION", expiration_at_ms: past }));
assert(rcExpired?.status === "expired", "RC expiration -> expired");

const rcCancel = mapRevenueCatEvent(rcEvent({ type: "CANCELLATION" }));
assert(rcCancel?.status === "active" && rcCancel?.cancelAtPeriodEnd === true, "RC cancellation (still active) -> active + cancelAtPeriodEnd");

const rcBilling = mapRevenueCatEvent(rcEvent({ type: "BILLING_ISSUE" }));
assert(rcBilling?.status === "past_due", "RC billing issue (still active) -> past_due");

const rcPlay = mapRevenueCatEvent(rcEvent({ store: "PLAY_STORE" }));
assert(rcPlay?.source === "play_store", "RC Play Store -> play_store source");

// ── RevenueCat: input that must not grant access ───────────────────────────────
assert(mapRevenueCatEvent(rcEvent({ app_user_id: "$RCAnonymousID:abc" })) === null, "RC anonymous app_user_id -> null (no account)");
assert(mapRevenueCatEvent(rcEvent({ app_user_id: "not-a-uuid" })) === null, "RC non-uuid app_user_id -> null");
assert(mapRevenueCatEvent(rcEvent({ store: "STRIPE" })) === null, "RC unhandled store -> null");
assert(mapRevenueCatEvent(rcEvent({ entitlement_ids: ["something_else"] })) === null, "RC unrelated entitlement -> null");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll entitlement-mapping self-tests passed.");
