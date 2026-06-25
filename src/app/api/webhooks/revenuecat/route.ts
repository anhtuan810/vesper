import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { markEventProcessed, upsertEntitlement } from "@/lib/entitlements";
import {
  mapRevenueCatEvent,
  transferRevokeWrites,
  type RevenueCatWebhookBody,
} from "@/lib/revenuecat-webhook";

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
    .eq("provider", "revenuecat")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw new Error(`billing_events read failed: ${error.message}`);
  return data != null;
}

// RevenueCat webhook (mobile purchases via StoreKit / Play Billing). Verifies the
// shared Authorization header against REVENUECAT_WEBHOOK_AUTH, dedupes by event id
// for idempotency, and maps the event to the entitlement using app_user_id (the
// Supabase user id stamped as the RevenueCat appUserID). Invalid auth or malformed
// input is rejected.
export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!expected) {
    Sentry.captureMessage("REVENUECAT_WEBHOOK_AUTH is not set", { level: "error" });
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }
  if ((request.headers.get("authorization") ?? "") !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RevenueCatWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const event = body.event;
  if (!event || typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  try {
    // Idempotency (at-least-once): the marker is written only AFTER a successful
    // apply, so its presence means the work is already done — ack the re-delivery
    // without reprocessing. This mirrors the Stripe webhook's apply-first/mark-last
    // ordering. The previous mark-first ordering could permanently strand an event:
    // a non-throwing crash (serverless timeout / OOM) between the marker insert and
    // the apply left the row marked-but-unapplied, and RevenueCat's deduped retries
    // then never re-applied it. Applying first makes a crash before the mark simply
    // leave the marker absent, so the retry re-applies.
    if (await eventAlreadyProcessed(supabase, event.id)) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    // Apply first, mark second. If the function crashes or times out between the
    // two, the marker is absent, so RevenueCat's retry reapplies (upsertEntitlement
    // is idempotent on user_id and guarded by the stale-event watermark) and then
    // marks — never marked-but-unapplied. A concurrent delivery that wins the insert
    // race shows up as 23505, which markEventProcessed reports as a non-fresh insert;
    // either way the work is done exactly once.
    const write = mapRevenueCatEvent(event);
    // null = event irrelevant (anonymous id, sandbox, unhandled store, unrelated
    // entitlement); we still mark it processed below so it is not reconsidered.
    if (write) await upsertEntitlement(supabase, write);
    // On a transfer, also revoke the previous owners so a stale grant never
    // lingers on an account that lost the subscription.
    for (const revoke of transferRevokeWrites(event)) {
      await upsertEntitlement(supabase, revoke);
    }

    await markEventProcessed(supabase, "revenuecat", event.id);

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "POST /api/webhooks/revenuecat", type: event.type },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
