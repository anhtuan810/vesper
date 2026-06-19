import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getEntitlement, toSubscriptionView, upsertEntitlement } from "@/lib/entitlements";
import { findStripeEntitlement } from "@/lib/stripe";
import { fetchRevenueCatSubscriber } from "@/lib/revenuecat";
import { mapRevenueCatSubscriber } from "@/lib/revenuecat-webhook";

export const runtime = "nodejs";

// Authed read of the signed-in user's subscription status — the only way a client
// learns whether it is entitled. The server is the source of truth; this never
// trusts a client-supplied user id (getAuthUser resolves it from the session or
// Bearer token). `no-store` so a just-completed purchase is reflected immediately,
// without a stale cached "not entitled" locking the user out.
export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = createServerSupabase();
    const row = await getEntitlement(supabase, user.id);
    let view = toSubscriptionView(row);

    // Self-heal: a user can complete Stripe Checkout yet have no entitlement here
    // if the webhook was missed, delayed, or not configured — stranding a paying
    // user behind the paywall even across re-logins. When we show no access, ask
    // Stripe directly (by stored customer id or email) and record any subscription
    // that currently grants access, so the read reflects reality. Best-effort: a
    // Stripe failure degrades to the unchanged view rather than failing the route.
    // Entitled reads skip this entirely, so it never touches the paying hot path.
    if (!view.entitled) {
      try {
        const write = await findStripeEntitlement(user.id, {
          customerId: row?.stripe_customer_id,
          email: user.email,
        });
        if (write) {
          await upsertEntitlement(supabase, write);
          view = toSubscriptionView(await getEntitlement(supabase, user.id));
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { route: "GET /api/subscription", step: "stripe-reconcile" },
        });
      }
    }

    // Self-heal: same idea for mobile (RevenueCat). When still not entitled, pull
    // the subscriber straight from RevenueCat's REST API and record any subscription
    // that currently grants access — so a just-completed App Store purchase
    // activates even if the webhook is delayed, dropped, or hasn't landed yet. This
    // makes activation deterministic: the client's post-purchase poll (and the
    // paywall's focus refresh) hit this and self-heal within seconds, instead of
    // waiting on a pushed webhook. No-ops if REVENUECAT_SECRET_API_KEY is unset, and
    // honors the same sandbox-isolation rule as the webhook (mapRevenueCatSubscriber).
    if (!view.entitled) {
      try {
        const subscriber = await fetchRevenueCatSubscriber(
          row?.revenuecat_app_user_id ?? user.id,
        );
        const write = subscriber ? mapRevenueCatSubscriber(subscriber, user.id) : null;
        if (write) {
          await upsertEntitlement(supabase, write);
          view = toSubscriptionView(await getEntitlement(supabase, user.id));
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { route: "GET /api/subscription", step: "revenuecat-reconcile" },
        });
      }
    }

    return NextResponse.json(view, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "GET /api/subscription" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
