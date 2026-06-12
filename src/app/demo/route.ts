import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { seedDemoUser } from "@/lib/demo-seed";

// One-tap entry into a fully populated demo account for App Review. Signs in as
// a dedicated demo user with credentials from env vars (never exposed to the
// client), reseeds that user's portfolio to a fixed dataset, and redirects to
// the Portfolio. Returns 404 when the credentials are absent, so the route is
// inert in any environment that hasn't opted in.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const email = process.env.DEMO_USER_EMAIL;
  const password = process.env.DEMO_USER_PASSWORD;
  if (!email || !password) {
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
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return redirectTo("/login");
    }
    await seedDemoUser(data.user.id);
    return response;
  } catch {
    return redirectTo("/login");
  }
}
