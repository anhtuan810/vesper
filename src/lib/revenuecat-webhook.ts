// Server-only mapping from a RevenueCat webhook event to our entitlement. Pure
// (no SDK, no secrets beyond the env product mapping), so it is unit-testable in
// isolation. The webhook route handles auth, idempotency, and persistence.

import type { EntitlementWrite } from "@/lib/entitlements";
import type { PlanId, SubscriptionSource, SubscriptionStatus } from "@/lib/subscription";

// The subset of the RevenueCat webhook payload we rely on.
// See https://www.revenuecat.com/docs/webhooks/event-types-and-fields
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  period_type?: string; // TRIAL | INTRO | NORMAL | PROMOTIONAL
  expiration_at_ms?: number | null;
  purchased_at_ms?: number | null;
  event_timestamp_ms?: number | null; // when RevenueCat emitted the event (ordering)
  store?: string; // APP_STORE | PLAY_STORE | MAC_APP_STORE | AMAZON | STRIPE
  environment?: string; // SANDBOX | PRODUCTION
  // TRANSFER moves a subscription between app_user_ids; the previous owner(s)
  // must lose access. See transferRevokeWrites.
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

export interface RevenueCatWebhookBody {
  api_version?: string;
  event?: RevenueCatEvent;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function entitlementId(): string {
  return process.env.NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID || "premium";
}

function sourceFromStore(store: string | undefined): SubscriptionSource | null {
  switch (store) {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play_store";
    default:
      // STRIPE-via-RevenueCat and AMAZON are not part of this integration.
      return null;
  }
}

function planForProduct(productId: string | undefined): PlanId | null {
  if (!productId) return null;
  if (productId === process.env.REVENUECAT_ANNUAL_PRODUCT_ID) return "annual";
  if (productId === process.env.REVENUECAT_MONTHLY_PRODUCT_ID) return "monthly";
  // Heuristic fallback so a missing env mapping still resolves the common cases.
  const p = productId.toLowerCase();
  if (p.includes("annual") || p.includes("year")) return "annual";
  if (p.includes("month")) return "monthly";
  return null;
}

// Maps an event to an entitlement write, or returns null when the event is
// irrelevant (anonymous app user id, an unhandled store, or an event that does
// not touch our entitlement). Returning null tells the webhook to ack-and-skip.
// Sandbox events (TestFlight / App Store sandbox / RevenueCat sandbox) reach the
// same webhook URL as production. Without this gate a sandbox purchase would write
// a real `active` entitlement, letting anyone with a sandbox Apple ID self-grant
// paid access in production. Sandbox is rejected unless explicitly opted in (set
// REVENUECAT_ALLOW_SANDBOX=true only in staging/dev to test real purchases).
function isAllowedEnvironment(environment: string | undefined): boolean {
  if (environment !== "SANDBOX") return true;
  return process.env.REVENUECAT_ALLOW_SANDBOX === "true";
}

export function mapRevenueCatEvent(event: RevenueCatEvent): EntitlementWrite | null {
  const userId = event.app_user_id;
  // Require a real Supabase user id. Anonymous RevenueCat ids ($RCAnonymousID:…)
  // and aliases never map to an account, so they are ignored.
  if (!userId || !UUID_RE.test(userId)) return null;

  if (!isAllowedEnvironment(event.environment)) return null;

  const source = sourceFromStore(event.store);
  if (!source) return null;

  // Act only on events that concern our entitlement. Some test events omit the
  // list entirely; those are allowed through.
  const ent = entitlementId();
  if (event.entitlement_ids && event.entitlement_ids.length > 0 && !event.entitlement_ids.includes(ent)) {
    return null;
  }

  const expMs = event.expiration_at_ms ?? null;
  const activeNow = expMs == null ? true : expMs > Date.now();
  const isTrial = event.period_type === "TRIAL" || event.period_type === "INTRO";

  let status: SubscriptionStatus;
  let cancelAtPeriodEnd = false;

  switch (event.type) {
    case "EXPIRATION":
      status = "expired";
      break;
    case "BILLING_ISSUE":
      status = activeNow ? "past_due" : "expired";
      break;
    case "CANCELLATION":
      // Auto-renew turned off; access continues until expiration.
      cancelAtPeriodEnd = true;
      status = activeNow ? (isTrial ? "trialing" : "active") : "expired";
      break;
    case "SUBSCRIPTION_PAUSED":
      // Play pause schedules a suspension at period end; access continues until
      // then, like a cancellation — not an immediate revoke.
      cancelAtPeriodEnd = true;
      status = activeNow ? (isTrial ? "trialing" : "active") : "canceled";
      break;
    default:
      // INITIAL_PURCHASE, RENEWAL, PRODUCT_CHANGE, UNCANCELLATION, TRANSFER, …
      status = activeNow ? (isTrial ? "trialing" : "active") : "expired";
  }

  const expIso = expMs ? new Date(expMs).toISOString() : null;
  const eventAt = event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : null;

  return {
    userId,
    status,
    source,
    plan: planForProduct(event.product_id),
    currentPeriodEnd: expIso,
    trialEnd: isTrial ? expIso : null,
    cancelAtPeriodEnd,
    // When set to cancel/pause, access runs until expiration — that's the end date.
    cancelAt: cancelAtPeriodEnd ? expIso : null,
    revenuecatAppUserId: userId,
    productId: event.product_id ?? null,
    eventAt,
  };
}

// A TRANSFER moves a subscription to a new app_user_id (e.g. "this subscription is
// already associated with a different account", a device/Apple-ID change, or a
// family change). The new owner is granted via the normal mapping above plus their
// own restore/renewal events; here we revoke the PREVIOUS owners listed in
// `transferred_from`, so a stale grant never lingers on an account that lost the
// subscription. Best-effort: only well-formed Supabase user ids are touched.
export function transferRevokeWrites(event: RevenueCatEvent): EntitlementWrite[] {
  if (event.type !== "TRANSFER" || !Array.isArray(event.transferred_from)) return [];
  if (!isAllowedEnvironment(event.environment)) return [];
  const source = sourceFromStore(event.store) ?? "app_store";
  const eventAt = event.event_timestamp_ms ? new Date(event.event_timestamp_ms).toISOString() : null;
  return event.transferred_from
    .filter((id) => typeof id === "string" && UUID_RE.test(id))
    .map((id) => ({
      userId: id,
      status: "expired" as const,
      source,
      plan: null,
      currentPeriodEnd: null,
      trialEnd: null,
      cancelAtPeriodEnd: false,
      cancelAt: null,
      revenuecatAppUserId: id,
      productId: event.product_id ?? null,
      eventAt,
    }));
}

// ── Reconcile (pull) path ─────────────────────────────────────────────────────
// Webhooks are pushed and eventually-consistent: they can be delayed, dropped, or
// (in a sandbox-gated build) skipped. To make activation deterministic, the status
// endpoint can pull the subscriber straight from RevenueCat's REST API and map it
// with the SAME rules as the webhook. This is the subset of the
// `GET /v1/subscribers/{id}` response we rely on.
export interface RevenueCatSubscriber {
  entitlements?: Record<
    string,
    { expires_date: string | null; product_identifier?: string }
  >;
  subscriptions?: Record<
    string,
    {
      expires_date?: string | null;
      period_type?: string; // normal | trial | intro
      store?: string; // app_store | mac_app_store | play_store | stripe | …
      is_sandbox?: boolean;
      unsubscribe_detected_at?: string | null;
      billing_issues_detected_at?: string | null;
    }
  >;
}

// Maps a RevenueCat REST subscriber to an entitlement write for `userId`, or null
// when nothing currently grants our entitlement. Mirrors mapRevenueCatEvent's rules
// — same entitlement id, sandbox isolation, store allow-list, and plan mapping — so
// the pull path can never grant access the push path wouldn't. Used by
// GET /api/subscription to self-heal a just-completed mobile purchase without
// waiting on the webhook.
export function mapRevenueCatSubscriber(
  subscriber: RevenueCatSubscriber,
  userId: string,
): EntitlementWrite | null {
  const e = subscriber.entitlements?.[entitlementId()];
  if (!e) return null;

  const productId = e.product_identifier;
  const sub = productId ? subscriber.subscriptions?.[productId] : undefined;

  // Sandbox isolation — identical gate to the webhook (REST `is_sandbox`).
  const environment = sub?.is_sandbox ? "SANDBOX" : "PRODUCTION";
  if (!isAllowedEnvironment(environment)) return null;

  // Only the stores this integration owns (App Store / Play). REST stores are
  // lowercase; sourceFromStore expects the webhook's uppercase form. Stripe is
  // owned by the Stripe path; promotional/amazon are out of scope → null.
  const source = sourceFromStore(sub?.store?.toUpperCase());
  if (!source) return null;

  const expIso = e.expires_date ?? null;
  const activeNow = expIso == null ? true : new Date(expIso).getTime() > Date.now();
  if (!activeNow) return null; // expired — leave revocation to the EXPIRATION webhook

  const isTrial = sub?.period_type === "trial" || sub?.period_type === "intro";
  const cancelAtPeriodEnd = sub?.unsubscribe_detected_at != null;
  const status: SubscriptionStatus =
    sub?.billing_issues_detected_at != null ? "past_due" : isTrial ? "trialing" : "active";

  return {
    userId,
    status,
    source,
    plan: planForProduct(productId),
    currentPeriodEnd: expIso,
    trialEnd: isTrial ? expIso : null,
    cancelAtPeriodEnd,
    cancelAt: cancelAtPeriodEnd ? expIso : null,
    revenuecatAppUserId: userId,
    productId: productId ?? null,
    // Reconcile reflects RevenueCat's truth as of now; advance the ordering
    // watermark so an older in-flight webhook can't overwrite it (newer events
    // still apply via the same comparison in upsertEntitlement).
    eventAt: new Date().toISOString(),
  };
}
