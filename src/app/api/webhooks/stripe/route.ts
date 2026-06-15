import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import {
  getStripe,
  mapStripeSubscription,
  userIdFromStripeSubscription,
} from "@/lib/stripe";
import {
  markEventProcessed,
  upsertEntitlement,
  userIdByStripeCustomer,
} from "@/lib/entitlements";

export const runtime = "nodejs";

type ServiceClient = ReturnType<typeof createServerSupabase>;

// Resolves the Supabase user id for a subscription: first the metadata we stamp
// at checkout, then a fallback lookup by Stripe customer id.
async function resolveUserId(
  supabase: ServiceClient,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const fromMeta = userIdFromStripeSubscription(sub);
  if (fromMeta) return fromMeta;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (customerId) return userIdByStripeCustomer(supabase, customerId);
  return null;
}

// Re-read the subscription fresh from Stripe so we always apply its CURRENT state,
// not the (possibly stale) snapshot embedded in an out-of-order or retried event —
// the Stripe-recommended way to stay correct without ordering bookkeeping. Falls
// back to the event payload if the subscription can no longer be retrieved.
async function freshSubscription(sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    return await getStripe().subscriptions.retrieve(sub.id);
  } catch (err) {
    if ((err as { code?: string }).code === "resource_missing") return sub;
    throw err;
  }
}

async function handleStripeEvent(supabase: ServiceClient, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = await freshSubscription(event.data.object as Stripe.Subscription);
      const userId = await resolveUserId(supabase, sub);
      if (!userId) {
        Sentry.captureMessage("Stripe webhook: unmapped subscription", {
          level: "warning",
          tags: { route: "POST /api/webhooks/stripe", type: event.type },
          extra: { subscription: sub.id },
        });
        return;
      }
      await upsertEntitlement(supabase, mapStripeSubscription(sub, userId));
      return;
    }
    case "checkout.session.completed": {
      // Belt-and-suspenders: write the entitlement as soon as checkout completes,
      // so web access unlocks even before customer.subscription.created lands.
      const session = event.data.object as Stripe.Checkout.Session;
      const userId =
        session.client_reference_id ||
        (session.metadata?.supabase_user_id as string | undefined) ||
        null;
      const subId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;
      if (userId && subId) {
        const sub = await getStripe().subscriptions.retrieve(subId);
        await upsertEntitlement(supabase, mapStripeSubscription(sub, userId));
      }
      return;
    }
    default:
      // Other event types are intentionally ignored.
      return;
  }
}

// Stripe webhook (web purchases). Verifies the signature against
// STRIPE_WEBHOOK_SECRET on the raw body, dedupes by event id for idempotency, and
// maps subscription state into the entitlement. Invalid signature or malformed
// input is rejected.
export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    Sentry.captureMessage("STRIPE_WEBHOOK_SECRET is not set", { level: "error" });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(payload, signature, secret);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  try {
    // Idempotency: record the event id first; a re-delivery is acked without
    // re-applying. On a handler failure we clear the marker so Stripe's retry
    // reprocesses rather than the update being silently dropped.
    const fresh = await markEventProcessed(supabase, "stripe", event.id);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });

    try {
      await handleStripeEvent(supabase, event);
    } catch (err) {
      await supabase
        .from("billing_events")
        .delete()
        .eq("provider", "stripe")
        .eq("event_id", event.id);
      throw err;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "POST /api/webhooks/stripe", type: event.type },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
