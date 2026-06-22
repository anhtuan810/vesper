import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS } from "@/lib/demo-session";

// Native-app counterpart of /demo (per-visitor demo entry). The web route signs
// the demo user in via cookies, which can't cross into the bundled app's
// capacitor://localhost origin — so this provisions the same fresh anonymous user
// and returns the session tokens for the client to adopt with
// supabase.auth.setSession(), plus the session's expires_at so the client wall
// knows the deadline. Same DEMO_ENABLED gate; inert (404) when it isn't switched on.
export async function POST() {
  if (process.env.DEMO_ENABLED !== "true") {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    const uid = data.user.id;

    // Seed the dataset + demo entitlement onto this fresh uid (wipe is a no-op on a
    // brand-new anonymous user).
    await seedDemoUser(uid);

    // Record the session and read back created_at, so the returned expires_at and
    // the server-side expiry guard measure the same instant.
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
