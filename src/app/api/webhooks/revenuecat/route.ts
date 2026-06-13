import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { markEventProcessed, upsertEntitlement } from "@/lib/entitlements";
import { mapRevenueCatEvent, type RevenueCatWebhookBody } from "@/lib/revenuecat-webhook";

export const runtime = "nodejs";

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
    const fresh = await markEventProcessed(supabase, "revenuecat", event.id);
    if (!fresh) return NextResponse.json({ received: true, duplicate: true });

    try {
      const write = mapRevenueCatEvent(event);
      // null = event irrelevant (anonymous id, unhandled store, unrelated
      // entitlement); the dedupe marker stays so it is not reconsidered.
      if (write) await upsertEntitlement(supabase, write);
    } catch (err) {
      await supabase
        .from("billing_events")
        .delete()
        .eq("provider", "revenuecat")
        .eq("event_id", event.id);
      throw err;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "POST /api/webhooks/revenuecat", type: event.type },
    });
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
