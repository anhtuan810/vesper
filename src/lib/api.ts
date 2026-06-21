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

// User-scoped HTTP-cache busting. Several /api GETs carry Cache-Control
// max-age headers, and the browser cache doesn't know the signed-in user
// changed — after an account switch the new user would be served the previous
// user's cached JSON for up to the max-age. UserProvider bumps the generation
// on sign-out/switch; GETs carry it as a throwaway param so post-switch
// requests miss the old cache entries. Survives the full-reload demo-account
// flow because it lives in sessionStorage (set after the purge that clears
// the volnar* namespace).
const CACHE_GEN_KEY = "volnar.apiCacheGen";

export function bumpApiCacheGeneration(): void {
  try { sessionStorage.setItem(CACHE_GEN_KEY, Date.now().toString(36)); } catch {}
}

function withCacheGen(path: string, init?: RequestInit): string {
  const method = (init?.method ?? "GET").toUpperCase();
  if (method !== "GET") return path;
  try {
    const gen = sessionStorage.getItem(CACHE_GEN_KEY);
    if (!gen) return path;
    return `${path}${path.includes("?") ? "&" : "?"}_g=${gen}`;
  } catch {
    return path;
  }
}

/**
 * fetch() options plus an optional per-request timeout. When `timeoutMs` is set
 * — and the caller hasn't supplied its own `signal` — the request aborts after
 * that many milliseconds and rejects, so a hung connection can't leave the
 * caller stuck. There is no default: callers opt in per request, so every
 * existing call site (including long-running ones like /api/chat) behaves
 * exactly as before.
 */
export type ApiFetchInit = RequestInit & { timeoutMs?: number };

/** Drop-in replacement for fetch() on /api paths. */
export async function apiFetch(path: string, init?: ApiFetchInit): Promise<Response> {
  const { timeoutMs, ...rest } = init ?? {};
  const target = withCacheGen(path, rest);

  // Resolve the URL + options for the active delivery target: web is
  // same-origin (session via cookies); native is cross-origin and carries the
  // access token as a Bearer header.
  let url: string;
  let options: RequestInit;
  if (!API_ORIGIN) {
    url = target;
    options = rest;
  } else {
    const headers = new Headers(rest.headers);
    try {
      const { data: { session } } = await createBrowserSupabase().auth.getSession();
      if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
    } catch {
      // No session (logged out) — let the API return 401 as it would on the web.
    }
    url = `${API_ORIGIN}${target}`;
    options = { ...rest, headers };
  }

  // No timeout requested, or the caller manages its own cancellation: behave
  // exactly like a plain fetch.
  if (timeoutMs == null || rest.signal) return fetch(url, options);

  // Abort once the timeout elapses so a stalled connection rejects (with a
  // clear message) instead of hanging forever. The timer is cleared in a
  // finally so it never leaks past the request.
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new Error("Request timed out");
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
