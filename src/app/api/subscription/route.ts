import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getEntitlement, toSubscriptionView } from "@/lib/entitlements";

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
    return NextResponse.json(toSubscriptionView(row), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "GET /api/subscription" } });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
