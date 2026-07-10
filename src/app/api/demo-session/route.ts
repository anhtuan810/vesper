import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS, clientIpFrom, demoMintAllowed } from "@/lib/demo-session";

// Native-app counterpart of /demo (App Review / public demo entry). The web route
// signs the demo user in via cookies, which can't cross into the bundled app's
// capacitor://localhost origin — so this returns session tokens for the client to
// adopt with supabase.auth.setSession().
//
// Two modes, selected by DEMO_ENABLED:
//   • DEMO_ENABLED === "true" → per-visitor ephemeral demo: a fresh anonymous user
//     each call, seeded, tracked in demo_users, returned with an expires_at the
//     client wall uses. Switch this on only together with a matching binary — the
//     wall/expiry UI ships inside the binary.
//   • otherwise → the legacy shared-account demo (DEMO_USER_EMAIL/PASSWORD), which
//     is exactly what the shipped App Store build calls. Kept as the default so the
//     released app's demo button keeps working in production until the per-visitor
//     demo is switched on. Inert (404) when no credentials are configured.
export async function POST(req: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Per-visitor ephemeral demo ──────────────────────────────────────────────
  if (process.env.DEMO_ENABLED === "true") {
    try {
      // Minting guard: every entry creates a fresh anonymous account with its
      // own chat allowance, so cap sessions per IP per hour BEFORE any account
      // exists. Fails open until the demo_ip_limits migration is applied.
      if (!(await demoMintAllowed(createServerSupabase(), clientIpFrom(req.headers)))) {
        return NextResponse.json(
          { error: "demo_busy", message: "Demo is busy right now — try again later." },
          { status: 429 },
        );
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user || !data.session) {
        return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
      }
      const uid = data.user.id;

      // The user was created a moment ago, so the seed skips its wipe phase
      // (freshUser) and the demo_users tracking row goes in concurrently with
      // the seed inserts — neither depends on the other.
      const service = createServerSupabase();
      const [, demoRowRes] = await Promise.all([
        seedDemoUser(uid, { freshUser: true }),
        service.from("demo_users").insert({ user_id: uid }).select("created_at").single(),
      ]);
      const { data: demoRow, error: demoError } = demoRowRes;
      if (demoError || !demoRow) {
        return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
      }

      const createdMs = Date.parse(demoRow.created_at as string);
      const expiresAt = new Date(createdMs + DEMO_SESSION_TTL_MS).toISOString();
      return NextResponse.json({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: expiresAt,
      });
    } catch {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
  }

  // ── Legacy shared-account demo (what the shipped binary calls) ───────────────
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    // When DEMO_USER_ID pins the demo account, the reseed already knows its
    // target — run it concurrently with the sign-in instead of after it (same
    // optimization as /demo). A reseed raced against a failed sign-in is
    // harmless: it only ever resets the demo account to its canonical state.
    const expectedId = process.env.DEMO_USER_ID;
    const [{ data, error }] = await Promise.all([
      supabase.auth.signInWithPassword({ email, password }),
      expectedId ? seedDemoUser(expectedId) : Promise.resolve(),
    ]);
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    if (expectedId && data.user.id !== expectedId) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    if (!expectedId) await seedDemoUser(data.user.id);
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
  }
}
