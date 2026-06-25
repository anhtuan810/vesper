import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS, DEMO_SESSION_GRACE_MS } from "@/lib/demo-session";

// One-tap entry into a fully populated demo account (App Review / public demo).
// Two modes, selected by DEMO_ENABLED:
//   • DEMO_ENABLED === "true" → per-visitor ephemeral demo: a fresh anonymous user
//     each entry, seeded, tracked in demo_users, with a readable demo_expires_at
//     cookie the client wall reads. Switch on only with a matching binary.
//   • otherwise → the legacy shared-account demo (DEMO_USER_EMAIL/PASSWORD), what
//     the site's demo button has always done. Kept as the default so the demo keeps
//     working in production until the per-visitor demo is switched on. The session
//     cookies are written onto the redirect either way (same pattern middleware.ts
//     uses), so "/" loads authenticated. Inert (404) when no credentials are set.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, request.url));
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

  // ── Per-visitor ephemeral demo ──────────────────────────────────────────────
  if (process.env.DEMO_ENABLED === "true") {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        return redirectTo("/login");
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
        return redirectTo("/login");
      }

      // Readable (non-HttpOnly) so the client expiry wall can read the deadline.
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

  // ── Legacy shared-account demo (the site's default demo) ─────────────────────
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
    return new NextResponse("Not found", { status: 404 });
  }
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return redirectTo("/login");
    }
    const expectedId = process.env.DEMO_USER_ID;
    if (expectedId && data.user.id !== expectedId) {
      return redirectTo("/login");
    }
    await seedDemoUser(data.user.id);
    return response;
  } catch {
    return redirectTo("/login");
  }
}
