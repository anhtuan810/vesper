import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS, DEMO_SESSION_GRACE_MS } from "@/lib/demo-session";

// One-tap entry into a fully populated, per-visitor demo account. Mints a fresh
// anonymous Supabase user, seeds that user's portfolio to the fixed demo dataset
// (and demo entitlement), records a demo_users row that starts a hard one-hour
// session clock, then redirects to the Portfolio with the session cookies written
// onto the redirect. Each entry is its own throwaway account with isolated data;
// the reap-demo cron wipes it once expired. Gated behind DEMO_ENABLED so the route
// is inert (404) wherever it isn't switched on.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (process.env.DEMO_ENABLED !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));

  // The session cookies are written onto this redirect response (the same
  // cookie-writing pattern middleware.ts uses), so "/" loads authenticated.
  const response = redirectTo("/");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    // A fresh anonymous user every entry — two visitors (or web + native on one
    // device) get two distinct uids with independent data and clocks.
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      return redirectTo("/login");
    }
    const uid = data.user.id;

    // Seed the dataset + demo entitlement onto this fresh uid. On a brand-new
    // anonymous user the wipe inside seedDemoUser is a no-op.
    await seedDemoUser(uid);

    // Record the session and read back its created_at, so the cookie below and the
    // server-side expiry guard (api/chat, mutation routes) measure the same instant.
    const service = createServerSupabase();
    const { data: demoRow, error: demoError } = await service
      .from("demo_users")
      .insert({ user_id: uid })
      .select("created_at")
      .single();
    if (demoError || !demoRow) {
      return redirectTo("/login");
    }

    // Readable (non-HttpOnly) so the client expiry wall can detect the deadline on
    // mount/interval without a round-trip. Expires a little after the grace window
    // so a stale cookie self-cleans; the wall also gates on the isDemo signal, so a
    // lingering value can never affect a real account.
    const createdMs = Date.parse(demoRow.created_at as string);
    const expiresAt = new Date(createdMs + DEMO_SESSION_TTL_MS).toISOString();
    response.cookies.set("demo_expires_at", expiresAt, {
      httpOnly: false,
      sameSite: "lax",
      path: "/",
      maxAge: Math.floor((DEMO_SESSION_TTL_MS + DEMO_SESSION_GRACE_MS) / 1000),
    });

    return response;
  } catch {
    return redirectTo("/login");
  }
}
