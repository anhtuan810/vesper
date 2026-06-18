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
import { hasAccess, isEntitled, trialDaysLeft, formatTrialDaysLeft } from "../src/lib/subscription";
import {
  mapStripeSubscription,
  planForStripePrice,
  userIdFromStripeSubscription,
} from "../src/lib/stripe";
import {
  mapRevenueCatEvent,
  transferRevokeWrites,
  type RevenueCatEvent,
} from "../src/lib/revenuecat-webhook";

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

// ── Access decision incl. past_due dunning grace ───────────────────────────────
const futureIso = new Date(future).toISOString();
const pastIso = new Date(past).toISOString();
assert(hasAccess("active", null), "active has access");
assert(hasAccess("trialing", null), "trialing has access");
assert(hasAccess("past_due", futureIso), "past_due within paid period keeps access (grace)");
assert(!hasAccess("past_due", pastIso), "past_due after period end loses access");
assert(!hasAccess("past_due", null), "past_due with no period end loses access");
assert(!hasAccess("canceled", futureIso), "canceled has no access even before period end");
assert(!hasAccess(null, null), "no subscription has no access");

// ── Trial days remaining (Profile countdown) ───────────────────────────────────
const t0 = new Date("2026-06-14T12:00:00Z");
assert(trialDaysLeft(null, t0) === null, "no trial end -> null");
assert(trialDaysLeft("not-a-date", t0) === null, "unparseable trial end -> null");
assert(trialDaysLeft("2026-06-14T11:00:00Z", t0) === 0, "already-passed trial -> 0 (clamped)");
assert(trialDaysLeft("2026-06-14T18:00:00Z", t0) === 1, "ends in 6h -> rounds up to 1");
assert(trialDaysLeft("2026-06-23T12:00:00Z", t0) === 9, "9 days out -> 9");
assert(formatTrialDaysLeft(0) === "Ends today", "0 -> Ends today");
assert(formatTrialDaysLeft(1) === "1 day left", "1 -> singular");
assert(formatTrialDaysLeft(9) === "9 days left", "9 -> plural");

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

// Cancel-at-period-end. In the 2026-05-27.dahlia API the billing portal records a
// portal cancel as a scheduled `cancel_at` timestamp (the legacy boolean stays
// false); older flows / the API still set the boolean. Either must map to cancelling,
// and "Don't cancel" (both cleared) must map back to false.
const sCancelViaTimestamp = mapStripeSubscription(
  stripeSub({ cancel_at: Math.floor(future / 1000), cancel_at_period_end: false }),
  USER,
);
assert(
  sCancelViaTimestamp.cancelAtPeriodEnd === true,
  "Stripe cancel_at set with boolean false -> cancelAtPeriodEnd true",
);
const sCancelViaBoolean = mapStripeSubscription(
  stripeSub({ cancel_at: null, cancel_at_period_end: true }),
  USER,
);
assert(
  sCancelViaBoolean.cancelAtPeriodEnd === true,
  "Stripe legacy cancel_at_period_end true -> cancelAtPeriodEnd true",
);
const sNotCancelling = mapStripeSubscription(
  stripeSub({ cancel_at: null, cancel_at_period_end: false }),
  USER,
);
assert(
  sNotCancelling.cancelAtPeriodEnd === false,
  "Stripe no cancel_at and boolean false -> cancelAtPeriodEnd false (don't-cancel)",
);

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

// ── RevenueCat: sandbox isolation ──────────────────────────────────────────────
assert(mapRevenueCatEvent(rcEvent({ environment: "SANDBOX" })) === null, "RC sandbox event -> null in production (no self-grant)");
process.env.REVENUECAT_ALLOW_SANDBOX = "true";
assert(mapRevenueCatEvent(rcEvent({ environment: "SANDBOX" }))?.status === "active", "RC sandbox event maps when explicitly allowed");
delete process.env.REVENUECAT_ALLOW_SANDBOX;

// ── RevenueCat: paused (Play) keeps access until period end ─────────────────────
const rcPausedActive = mapRevenueCatEvent(rcEvent({ type: "SUBSCRIPTION_PAUSED" }));
assert(rcPausedActive?.status === "active" && rcPausedActive?.cancelAtPeriodEnd === true, "RC pause within period -> active + cancelAtPeriodEnd");
const rcPausedEnded = mapRevenueCatEvent(rcEvent({ type: "SUBSCRIPTION_PAUSED", expiration_at_ms: past }));
assert(rcPausedEnded?.status === "canceled", "RC pause after period end -> canceled");

// ── RevenueCat: event timestamp -> ordering watermark ──────────────────────────
assert(mapRevenueCatEvent(rcEvent({ event_timestamp_ms: future }))?.eventAt === new Date(future).toISOString(), "RC event_timestamp_ms -> eventAt ISO");
assert(mapRevenueCatEvent(rcEvent({}))?.eventAt === null, "RC without event_timestamp_ms -> eventAt null");

// ── RevenueCat: TRANSFER revokes the previous owner(s) ─────────────────────────
const OTHER = "22222222-2222-4222-8222-222222222222";
const revokes = transferRevokeWrites(rcEvent({ type: "TRANSFER", transferred_from: [USER, OTHER, "not-a-uuid"], store: "PLAY_STORE" }));
assert(revokes.length === 2, "TRANSFER revokes only well-formed user ids");
assert(revokes.every((w) => w.status === "expired" && w.source === "play_store"), "TRANSFER revokes are expired + correct source");
assert(transferRevokeWrites(rcEvent({})) .length === 0, "non-transfer event -> no revokes");

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll entitlement-mapping self-tests passed.");
