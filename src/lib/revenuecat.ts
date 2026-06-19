import * as Sentry from "@sentry/nextjs";
import type { RevenueCatSubscriber } from "@/lib/revenuecat-webhook";

// Server-side RevenueCat REST helpers. These use the SECRET API key (never the
// public SDK keys) and so must only ever run on the server.

const REVENUECAT_API = "https://api.revenuecat.com/v1";

// Permanently deletes a RevenueCat customer (subscriber) and their purchase
// history, identified by appUserID — which is the Supabase user id we stamp on
// every purchase. Called on account deletion so RevenueCat retains no record of
// a user who asked to be erased.
//
// Best-effort by design: the server is the source of truth (the `entitlements`
// row is already dropped on deletion), so this is housekeeping on RevenueCat's
// side and must never block or fail account deletion. It therefore no-ops when
// REVENUECAT_SECRET_API_KEY is unset, treats 404 (already gone) as success, and
// swallows every error to Sentry. Bounded by a short timeout so a slow/unreachable
// RevenueCat API can't stall the deletion request.
export async function deleteRevenueCatCustomer(appUserId: string): Promise<void> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return;

  try {
    const res = await fetch(
      `${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(5000),
      },
    );
    // 404 = subscriber never existed (e.g. a user who never opened the paywall) —
    // already in the desired state, so not an error.
    if (!res.ok && res.status !== 404) {
      throw new Error(`RevenueCat delete subscriber failed: ${res.status}`);
    }
  } catch (e) {
    Sentry.captureException(e, { tags: { area: "revenuecat-delete-customer" } });
  }
}

// Fetches the subscriber from RevenueCat's REST API for on-demand entitlement
// reconciliation (GET /api/subscription self-heal). Returns null when the secret
// key is unset, the subscriber is unknown (404), or the call fails — callers then
// fall back to the webhook-written state. Bounded by a 5s timeout so a slow
// RevenueCat API can't stall the status read.
export async function fetchRevenueCatSubscriber(
  appUserId: string,
): Promise<RevenueCatSubscriber | null> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `${REVENUECAT_API}/subscribers/${encodeURIComponent(appUserId)}`,
      { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) },
    );
    if (res.status === 404) return null; // unknown subscriber — nothing to reconcile
    if (!res.ok) throw new Error(`RevenueCat get subscriber failed: ${res.status}`);
    const body = (await res.json()) as { subscriber?: RevenueCatSubscriber };
    return body.subscriber ?? null;
  } catch (e) {
    Sentry.captureException(e, { tags: { area: "revenuecat-fetch-subscriber" } });
    return null;
  }
}
