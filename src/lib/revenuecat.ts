import * as Sentry from "@sentry/nextjs";

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
