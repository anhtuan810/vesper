import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getStripe, stripePriceId } from "@/lib/stripe";
import { getEntitlement } from "@/lib/entitlements";
import { TRIAL_DAYS, type PlanId } from "@/lib/subscription";

export const runtime = "nodejs";

// Starts a Stripe Checkout session for a web purchase (subscription mode, 7-day
// card-on-file trial). Login is required first, and the user id is stamped onto
// both the customer (metadata) and the subscription (client_reference_id +
// subscription_data.metadata) so the webhook can map the purchase to the account.
// The native app never calls this — it purchases through RevenueCat/StoreKit.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { plan?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const plan: PlanId | null =
    body.plan === "annual" ? "annual" : body.plan === "monthly" ? "monthly" : null;
  if (!plan) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  try {
    const stripe = getStripe();
    const supabase = createServerSupabase();
    const existing = await getEntitlement(supabase, user.id);

    // Reuse the account's Stripe customer if we already have one, else create one
    // stamped with the Supabase user id.
    let customerId = existing?.stripe_customer_id ?? null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
    }

    // The 7-day free trial is granted once per account. An entitlement row exists
    // only after a real subscription has been created on some platform, so its
    // presence means the user has already had their trial — a returning subscriber
    // (cancelled then re-subscribing) is charged immediately, closing the
    // cancel-before-trial-end → re-subscribe loop of endless free trials. StoreKit
    // enforces this per Apple ID natively; this is the web equivalent.
    const grantTrial = !existing;

    const origin = request.nextUrl.origin;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: stripePriceId(plan), quantity: 1 }],
      subscription_data: {
        ...(grantTrial ? { trial_period_days: TRIAL_DAYS } : {}),
        metadata: { supabase_user_id: user.id },
      },
      // Card-on-file: collect a payment method even though the trial is free.
      payment_method_collection: "always",
      allow_promotion_codes: true,
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/checkout" } });
    return NextResponse.json({ error: "Could not start checkout" }, { status: 500 });
  }
}
