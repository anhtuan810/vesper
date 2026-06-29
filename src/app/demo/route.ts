import { randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { seedDemoUser } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS, DEMO_SESSION_GRACE_MS, DEMO_VISITOR_COOKIE_TTL_MS } from "@/lib/demo-session";

// Resolve the browser's trial start from the persistent `demo_visitor` cookie:
// reuse the recorded first_seen, or record it now on the first entry. Returns the
// visitor id (when tracking succeeded) and the trial deadline in ms. Degrades to
// { tracked:false } when demo_visitors is unavailable (migration not applied), so
// the demo still works on the legacy per-entry clock.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveVisitorTrial(
  service: ReturnType<typeof createServerSupabase>,
  cookieVisitorId: string | undefined,
): Promise<{ tracked: boolean; visitorId?: string; deadlineMs: number | null }> {
  try {
    // Only trust a well-formed UUID from the cookie; anything else (junk, or an
    // attacker-set value) would otherwise error the uuid query and silently drop
    // the browser onto the untracked legacy clock. Treat invalid as a new visitor.
    const visitorId = cookieVisitorId && UUID_RE.test(cookieVisitorId) ? cookieVisitorId : randomUUID();
    const { data: existing, error: selErr } = await service
      .from("demo_visitors").select("first_seen").eq("visitor_id", visitorId).maybeSingle();
    if (selErr) throw selErr;

    let firstSeenMs: number | null = existing?.first_seen ? Date.parse(existing.first_seen as string) : null;
    if (firstSeenMs == null || Number.isNaN(firstSeenMs)) {
      const { data: ins, error: insErr } = await service
        .from("demo_visitors").insert({ visitor_id: visitorId }).select("first_seen").single();
      if (insErr) {
        // Likely a concurrent first entry — re-read the winner's first_seen.
        const { data: again } = await service
          .from("demo_visitors").select("first_seen").eq("visitor_id", visitorId).maybeSingle();
        if (!again?.first_seen) throw insErr;
        firstSeenMs = Date.parse(again.first_seen as string);
      } else {
        firstSeenMs = ins?.first_seen ? Date.parse(ins.first_seen as string) : Date.now();
      }
    }
    return { tracked: true, visitorId, deadlineMs: firstSeenMs + DEMO_SESSION_TTL_MS };
  } catch {
    return { tracked: false, deadlineMs: null };
  }
}

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

  // Signal the client (the pre-hydration purge script in layout.tsx) that this
  // entry reseeded the demo account, so it clears any chat/figure caches a
  // PREVIOUS demo session left in this browser before the app reads them. The
  // shared-account demo reuses one user id across entries, so the per-user
  // localStorage chat cache (use-chat-session) survives the server-side wipe and
  // a stale conversation would otherwise resurface in a "fresh" demo. Only the
  // success paths return this `response` (failures build their own redirect to
  // /login), so the flag ships only when a reseed actually happened. Readable
  // (non-HttpOnly so the script can see it), short-lived, consumed on first load.
  response.cookies.set("volnar_demo_reseed", String(Date.now()), {
    httpOnly: false,
    sameSite: "lax",
    path: "/",
    maxAge: 60,
  });

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
      const service = createServerSupabase();

      // The trial is anchored to the BROWSER (a persistent demo_visitor cookie that
      // survives sign-out), so re-entering the demo never resets the clock.
      const cookieVisitorId = request.cookies.get("demo_visitor")?.value;
      const trial = await resolveVisitorTrial(service, cookieVisitorId);

      // Trial already used up on this browser → don't mint a throwaway demo user.
      if (trial.deadlineMs != null && Date.now() >= trial.deadlineMs) {
        return redirectTo("/login");
      }
      if (trial.tracked && trial.visitorId) {
        response.cookies.set("demo_visitor", trial.visitorId, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: Math.floor(DEMO_VISITOR_COOKIE_TTL_MS / 1000),
        });
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error || !data.user) {
        return redirectTo("/login");
      }
      const uid = data.user.id;
      await seedDemoUser(uid);

      const demoInsert: Record<string, unknown> = { user_id: uid };
      if (trial.tracked && trial.visitorId) demoInsert.visitor_id = trial.visitorId;
      const { data: demoRow, error: demoError } = await service
        .from("demo_users")
        .insert(demoInsert)
        .select("created_at")
        .single();
      if (demoError || !demoRow) {
        return redirectTo("/login");
      }

      // Deadline: the browser's shared deadline when tracked, else the legacy
      // per-entry clock. Readable (non-HttpOnly) so the client wall can read it.
      const createdMs = Date.parse(demoRow.created_at as string);
      const expiresAtMs = trial.deadlineMs ?? createdMs + DEMO_SESSION_TTL_MS;
      response.cookies.set("demo_expires_at", new Date(expiresAtMs).toISOString(), {
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
