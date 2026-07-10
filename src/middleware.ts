import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  ONBOARDING_COOKIES,
  ONBOARDING_COOKIE_OPTIONS,
  onboardedMatchesUser,
  passMatchesSession,
  signOnboarded,
  sessionIdFromAccessToken,
} from "@/lib/onboarding-pass";

// The native app's bundled UI runs at these WKWebView origins and calls the
// API cross-origin with a Bearer token (no cookies, so no CSRF surface — see
// getAuthUser). Only these exact origins are echoed back.
const NATIVE_ORIGINS = new Set(["capacitor://localhost", "ionic://localhost"]);

function corsHeaders(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export async function middleware(request: NextRequest) {
  // CORS for the native app on /api — auth/session logic stays out of this
  // branch (each API route validates its own user; see getAuthUser).
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const origin = request.headers.get("origin") ?? "";
    if (!NATIVE_ORIGINS.has(origin)) return NextResponse.next();
    if (request.method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: corsHeaders(origin) });
    }
    const response = NextResponse.next();
    for (const [k, v] of Object.entries(corsHeaders(origin))) response.headers.set(k, v);
    return response;
  }

  // Shared metadata routes (robots, sitemap, generated icons) resolve at the
  // app root on every domain: skip the marketing rewrite AND the login gate.
  // /_vercel is the platform's own namespace — Vercel Analytics loads
  // /_vercel/insights/script.js and POSTs /_vercel/insights/event. The
  // marketing rewrite below used to fold those into /marketing/_vercel/* (a
  // 404), which silently killed analytics on volnar.nl.
  {
    const { pathname } = request.nextUrl;
    if (
      pathname === "/robots.txt" ||
      pathname === "/sitemap.xml" ||
      pathname.startsWith("/icon") ||
      pathname.startsWith("/apple-icon") ||
      pathname.startsWith("/_vercel")
    ) {
      return NextResponse.next();
    }
  }

  // Rewrite marketing domains to /marketing/* without changing the URL bar.
  const host = request.headers.get("host")?.toLowerCase().replace(/:\d+$/, "") ?? "";
  const isMarketingDomain = host === "volnar.nl" || host === "www.volnar.nl";

  if (isMarketingDomain) {
    const { pathname } = request.nextUrl;
    const url = request.nextUrl.clone();
    if (!pathname.startsWith("/marketing")) {
      url.pathname = pathname === "/" ? "/marketing" : `/marketing${pathname}`;
    }
    // Forward a header so the root layout can skip app chrome server-side.
    // usePathname() on the client still returns the original URL ("/"), not the
    // rewritten path, so the BottomNav's own pathname guard would miss it.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-volnar-domain", "marketing");
    return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
  }

  // Path-based access on the app domain (and local dev): same marketing chrome,
  // no session work — these pages are public and render full-bleed.
  if (request.nextUrl.pathname.startsWith("/marketing")) {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-volnar-domain", "marketing");
    return NextResponse.next({ request: { headers: requestHeaders } });
  }

  let supabaseResponse = NextResponse.next({ request });

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
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If not logged in and not on a public path, redirect to login
  const isPublic =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/demo") ||
    request.nextUrl.pathname.startsWith("/marketing");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    const next = request.nextUrl.pathname + request.nextUrl.search;
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  // If logged in and on the login page, send to the app — EXCEPT for a demo
  // session. A visitor who explored the demo still carries its session; bouncing
  // them off /login would drop them straight back into the demo account when they
  // meant to sign in as themselves. Let them reach /login (a real sign-in there
  // replaces the demo session). Per-visitor demo accounts are anonymous Supabase
  // users, so is_anonymous is the reliable signal. Normal accounts are unaffected.
  const isDemoSession = !!user?.is_anonymous;
  if (user && !isDemoSession && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // ── Gated onboarding ────────────────────────────────────────────────────────
  // A user who has never finished onboarding is redirected to /onboarding from any
  // app page, and can't reach the app by editing the URL (the flag lives in the DB —
  // server-authoritative). Demo (anonymous) users are exempt (they carry seeded
  // data), as are the public paths handled above. `/onboarding` itself, `/api/*`,
  // and `/auth/*` are already outside this branch (matcher + isPublic), so the only
  // path this block gates is the app proper.
  const path = request.nextUrl.pathname;
  const onOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");
  if (user && !isDemoSession && !isPublic) {
    // Fast path: a valid signed "onboarded" marker means done — skip the DB read.
    const onboardedCookie = request.cookies.get(ONBOARDING_COOKIES.ONBOARDED_COOKIE)?.value;
    let completed = onboardedCookie ? await onboardedMatchesUser(onboardedCookie, user.id) : false;

    if (!completed) {
      // Consult the flag. 'unknown' (column missing pre-migration, or a transient
      // read error) FAILS OPEN — never wall production before the migration runs.
      let status: "completed" | "incomplete" | "unknown" = "unknown";
      try {
        const { data, error } = await supabase
          .from("users")
          .select("onboarding_completed_at")
          .eq("id", user.id)
          .maybeSingle();
        if (!error && data) {
          status =
            (data as { onboarding_completed_at?: string | null }).onboarding_completed_at != null
              ? "completed"
              : "incomplete";
        }
      } catch {
        /* fail open — leave status 'unknown' */
      }

      if (status === "completed") {
        completed = true;
        // Cache the result so the next navigation skips the DB read.
        supabaseResponse.cookies.set(
          ONBOARDING_COOKIES.ONBOARDED_COOKIE,
          await signOnboarded(user.id),
          ONBOARDING_COOKIE_OPTIONS,
        );
      } else if (status === "incomplete") {
        // A genuinely-unfinished user may still hold a valid empty-exit pass
        // (Done-with-no-data), which the gate honors in addition to the flag.
        const passCookie = request.cookies.get(ONBOARDING_COOKIES.PASS_COOKIE)?.value;
        let hasPass = false;
        if (passCookie) {
          const { data: sess } = await supabase.auth.getSession();
          const sessionId = sessionIdFromAccessToken(sess.session?.access_token);
          hasPass = await passMatchesSession(passCookie, sessionId);
        }
        if (!hasPass && !onOnboarding) {
          const url = request.nextUrl.clone();
          url.pathname = "/onboarding";
          url.search = "";
          return NextResponse.redirect(url);
        }
      }
      // status 'unknown' -> fail open (fall through)
    }

    // A finished user never sees /onboarding again — even if they later sell
    // everything and sit at zero assets.
    if (completed && onOnboarding) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // App pages (session refresh + login gating) — excludes api/ and auth/.
    "/((?!_next/static|_next/image|favicon.ico|api/|auth/).*)",
    // API routes — CORS-only branch above (no session work).
    "/api/:path*",
  ],
};
