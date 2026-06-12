import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { seedDemoUser } from "@/lib/demo-seed";

// Native-app counterpart of /demo (App Review entry point). The web route
// signs the demo user in via cookies, which can't cross into the bundled
// app's capacitor://localhost origin — so this returns the session tokens
// for the client to adopt with supabase.auth.setSession(). Same env gating
// and reseed-safety assertions as /demo; inert (404) when creds are absent.
export async function POST() {
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return new NextResponse("Not found", { status: 404 });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) {
      return NextResponse.json({ error: "Demo unavailable" }, { status: 503 });
    }
    // Defense in depth (mirrors /demo): seed strictly the id this password
    // sign-in returned, and abort on a DEMO_USER_ID mismatch so a real
    // account can never be reseeded.
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
