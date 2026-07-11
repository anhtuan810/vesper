import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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
