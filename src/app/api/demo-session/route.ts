import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS } from "@/lib/demo-session";

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
export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // ── Per-visitor ephemeral demo ──────────────────────────────────────────────
  if (process.env.DEMO_ENABLED === "true") {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user || !data.session) {
        return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
      }
      const uid = data.user.id;
      await seedDemoUser(uid);

      const service = createServerSupabase();
      const { data: demoRow, error: demoError } = await service
        .from("demo_users")
        .insert({ user_id: uid })
        .select("created_at")
        .single();
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    const expectedId = process.env.DEMO_USER_ID;
    if (expectedId && data.user.id !== expectedId) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    await seedDemoUser(data.user.id);
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch {
    return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
  }
}
