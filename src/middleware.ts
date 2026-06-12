import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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

  // If logged in and on login page, redirect to home
  if (user && request.nextUrl.pathname.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|auth/).*)",
  ],
};
