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

// Whether this event was already applied-and-marked. The marker is inserted only
// after a successful apply, so a present row means the work is done and a
// re-delivery can be acked without reprocessing.
async function eventAlreadyProcessed(
  supabase: ServiceClient,
  eventId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("billing_events")
    .select("event_id")
    .eq("provider", "stripe")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`billing_events read failed: ${error.message}`);
  return data != null;
}

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
// the Stripe-recommended way to stay correct without ordering bookkeeping.
async function freshSubscription(sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    return await getStripe().subscriptions.retrieve(sub.id);
  } catch (err) {
    // The subscription no longer exists at Stripe — it is gone, so the write must
    // map to canceled. Returning the event's (possibly still-active) snapshot
    // unchanged could re-grant access; keep its ref ids and period fields but
    // force the terminal status.
    if ((err as { code?: string }).code === "resource_missing") {
      return { ...sub, status: "canceled" };
    }
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
      // TEMP ENTDBG: trace the freshly re-read subscription per event so two
      // near-simultaneous subscription.updated deliveries can be compared in the
      // logs. Remove once the cancel_at_period_end persistence bug is resolved.
      console.log(
        JSON.stringify({
          tag: "ENTDBG/stripe-handler",
          eventId: event.id,
          eventType: event.type,
          subId: sub.id,
          freshCancelAtPeriodEnd: sub.cancel_at_period_end,
          freshStatus: sub.status,
          userId,
        }),
      );
      if (!userId) {
        console.log(
          JSON.stringify({
            tag: "ENTDBG/stripe-handler",
            eventId: event.id,
            subId: sub.id,
            branch: "UNMAPPED_RETURN",
          }),
        );
        Sentry.captureMessage("Stripe webhook: unmapped subscription", {
          level: "warning",
          tags: { route: "POST /api/webhooks/stripe", type: event.type },
          extra: { subscription: sub.id },
        });
        return;
      }
      const write = mapStripeSubscription(sub, userId);
      // Cancellation is authoritative: a deleted subscription must always land as
      // canceled — never re-granted by a stale or replayed snapshot — so force the
      // status, using the re-read only for ref ids and period fields. created and
      // updated keep the fresh-read status.
      if (event.type === "customer.subscription.deleted") write.status = "canceled";
      // TEMP ENTDBG: the mapped write that feeds the upsert.
      console.log(
        JSON.stringify({
          tag: "ENTDBG/stripe-handler",
          eventId: event.id,
          subId: sub.id,
          writeCancelAtPeriodEnd: write.cancelAtPeriodEnd,
          writeStatus: write.status,
          writeCurrentPeriodEnd: write.currentPeriodEnd,
        }),
      );
      await upsertEntitlement(supabase, write, event.id);
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
        await upsertEntitlement(supabase, mapStripeSubscription(sub, userId), event.id);
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
    // Idempotency (at-least-once): the marker is written only AFTER a successful
    // apply, so its presence means the work is already done — ack the re-delivery
    // without reprocessing.
    if (await eventAlreadyProcessed(supabase, event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Apply first, mark second. If the function crashes or times out between the
    // two, the marker is absent, so Stripe's retry reapplies (upsertEntitlement is
    // idempotent on user_id) and then marks — never marked-but-unapplied. A
    // concurrent delivery that wins the insert race shows up as 23505, which
    // markEventProcessed reports as a non-fresh insert; either way the work is done.
    await handleStripeEvent(supabase, event);
    await markEventProcessed(supabase, "stripe", event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "POST /api/webhooks/stripe", type: event.type },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
