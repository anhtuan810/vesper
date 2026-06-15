// Server-only: the real paid-access enforcement for premium API routes. The
// client paywall (src/components/Paywall.tsx) hides these surfaces in the UI, but
// the overlay is only a div — a request that bypasses it (devtools, a direct API
// call, a stale client) must still be refused here. This is where the server
// actually *decides* access, not just reports it.
//
// Read via the service role; trialing/active (and a past_due subscriber still
// inside the period they already paid for) pass — every other state, and a missing
// row, is refused with 402. The demo account is seeded 'active', so /demo is
// unaffected. Gate only genuinely premium/cost-bearing routes (AI generation,
// scenario compute); auth-only endpoints needed before purchase (subscription
// status, checkout, billing portal, profile, account deletion) must stay open.

import { NextResponse } from "next/server";
import type { createServerSupabase } from "@/lib/supabase";
import { getEntitlement } from "@/lib/entitlements";
import { hasAccess } from "@/lib/subscription";

type ServiceClient = ReturnType<typeof createServerSupabase>;

// Returns null when the user may use premium features (caller proceeds), or a 402
// response to return verbatim when they may not. 402 Payment Required is the honest
// status; the client treats it like the paywall (re-read GET /api/subscription).
export async function entitledGate(
  supabase: ServiceClient,
  userId: string,
): Promise<NextResponse | null> {
  const row = await getEntitlement(supabase, userId);
  if (hasAccess(row?.status, row?.current_period_end)) return null;
  return NextResponse.json(
    { error: "Subscription required", code: "subscription_required" },
    { status: 402 },
  );
}
