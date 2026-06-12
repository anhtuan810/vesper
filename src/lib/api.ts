// API access that works from both delivery targets:
//
// - Web (app.volnar.nl): same-origin fetches, session carried by Supabase
//   cookies. NEXT_PUBLIC_API_ORIGIN is unset, so apiFetch is a plain fetch —
//   zero overhead, byte-identical behavior to before this helper existed.
// - Native (bundled UI, origin capacitor://localhost): NEXT_PUBLIC_API_ORIGIN
//   points at the production server. Cookies don't cross that origin, so the
//   Supabase access token rides an Authorization: Bearer header instead
//   (validated server-side in getAuthUser; CORS allowed in middleware.ts).

import { createBrowserSupabase } from "@/lib/supabase";

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

/** True in the native (static-export) build. */
export const isNativeBuild = process.env.NEXT_PUBLIC_BUILD_TARGET === "native";

/** Absolute URL for an /api path — for non-fetch consumers like <img src>. */
export function apiUrl(path: string): string {
  return `${API_ORIGIN}${path}`;
}

/** Drop-in replacement for fetch() on /api paths. */
export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!API_ORIGIN) return fetch(path, init);

  const headers = new Headers(init?.headers);
  try {
    const { data: { session } } = await createBrowserSupabase().auth.getSession();
    if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  } catch {
    // No session (logged out) — let the API return 401 as it would on the web.
  }
  return fetch(`${API_ORIGIN}${path}`, { ...init, headers });
}
