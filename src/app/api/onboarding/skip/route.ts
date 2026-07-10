import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getAuthUser } from "@/lib/supabase";
import {
  signPass,
  sessionIdFromAccessToken,
  ONBOARDING_COOKIES,
  ONBOARDING_COOKIE_OPTIONS,
} from "@/lib/onboarding-pass";

// Issues the "Done with no data" empty-exit pass — a session-bound signed cookie the
// middleware honors IN ADDITION to the onboarding flag, letting a user peek at the
// empty app WITHOUT flipping the flag (no DB write). The pass is bound to the auth
// session_id so it dies on a real re-auth; it is also a session cookie (no Max-Age),
// so the next cold open with a null flag and no pass drops the user back into
// onboarding — exactly the intended "peek, then return" behavior.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessionId = await readSessionId(request);
  const res = NextResponse.json({ ok: true });
  if (sessionId) {
    res.cookies.set(
      ONBOARDING_COOKIES.PASS_COOKIE,
      await signPass(sessionId),
      ONBOARDING_COOKIE_OPTIONS,
    );
  }
  return res;
}

// The auth session_id lives in the access-token JWT, not on the user object. Native
// (Bearer) requests carry the token in the header; web requests carry it in the
// cookie session. getSession reads the cookie with no network round-trip.
async function readSessionId(request: NextRequest): Promise<string | null> {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (bearer) return sessionIdFromAccessToken(bearer);

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data } = await supabase.auth.getSession();
  return sessionIdFromAccessToken(data.session?.access_token);
}
