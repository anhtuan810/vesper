import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { getEntitlement } from "@/lib/entitlements";

export const runtime = "nodejs";

// Opens the Stripe billing portal for a web subscriber (the "Manage" action when
// the entitlement's source is Stripe). iOS/Android manage their subscriptions in
// the App Store / Play Store instead, so those sources never reach this route.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const supabase = createServerSupabase();
    const existing = await getEntitlement(supabase, user.id);
    const customerId = existing?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json({ error: "No billing account" }, { status: 404 });
    }

    const stripe = getStripe();
    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${request.nextUrl.origin}/profile`,
    });
    return NextResponse.json({ url: portal.url });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/billing-portal" } });
    return NextResponse.json({ error: "Could not open billing portal" }, { status: 500 });
  }
}
