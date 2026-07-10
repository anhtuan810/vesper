// Signed cookies for the gated-onboarding flow. Two cookies, both HMAC-SHA256
// signed via Web Crypto so the same code runs unchanged in the proxy/middleware
// runtime and in Node route handlers (no Node-only `crypto` import):
//
//   vn_onb_pass  — the "Done with no data" empty-exit pass. Bound to the auth
//                  session_id, so it dies on a real re-auth (a fresh sign-in mints a
//                  new session_id) — predictable across tab-close / PWA quirks in a
//                  way a plain session cookie is not. Issued with NO Max-Age so it is
//                  also a session cookie that clears on browser-session end. The gate
//                  honors it IN ADDITION to the DB flag, letting a user peek at the
//                  empty app with no DB write. Forging it only lets a user skip their
//                  OWN onboarding (exactly what the Skip button does), so the
//                  signature is defense-in-depth, not a security boundary.
//
//   vn_onboarded — a fast-path marker set once onboarding is complete, bound to the
//                  user id. Lets the gate skip the per-navigation flag read for the
//                  (overwhelmingly common) already-onboarded case. The DB flag stays
//                  the source of truth; this is purely an optimization.

const PASS_COOKIE = "vn_onb_pass";
const ONBOARDED_COOKIE = "vn_onboarded";

// The signing secret. A dedicated ONBOARDING_PASS_SECRET is preferred; we fall back
// to the always-present service-role key so signatures are strong even when the
// dedicated var is unset (the HMAC output never reveals the key, and it never leaves
// the server). The final literal only matters in a misconfigured local dev.
function secret(): string {
  return (
    process.env.ONBOARDING_PASS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "volnar-onboarding-pass-dev-secret"
  );
}

const enc = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return base64url(new Uint8Array(sig));
}

// Length-guarded, non-short-circuiting compare. Inputs are same-length base64url
// HMACs, so accumulating an XOR diff avoids leaking a match prefix via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sign(payload: string): Promise<string> {
  return `${payload}.${await hmac(payload)}`;
}

async function verify(signed: string | undefined | null): Promise<string | null> {
  if (!signed) return null;
  const dot = signed.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = signed.slice(0, dot);
  const sig = signed.slice(dot + 1);
  return safeEqual(sig, await hmac(payload)) ? payload : null;
}

// ── Empty-exit pass (session-bound) ─────────────────────────────────────────────

export async function signPass(sessionId: string): Promise<string> {
  return sign(sessionId);
}

/** True only when the cookie is a valid signature over the CURRENT session_id. */
export async function passMatchesSession(
  cookieValue: string | undefined | null,
  sessionId: string | null,
): Promise<boolean> {
  if (!sessionId) return false;
  const payload = await verify(cookieValue);
  return payload !== null && payload === sessionId;
}

// ── Onboarded fast-path marker (user-bound) ─────────────────────────────────────

export async function signOnboarded(userId: string): Promise<string> {
  return sign(userId);
}

export async function onboardedMatchesUser(
  cookieValue: string | undefined | null,
  userId: string,
): Promise<boolean> {
  const payload = await verify(cookieValue);
  return payload !== null && payload === userId;
}

// ── session_id extraction ───────────────────────────────────────────────────────
// Decode the `session_id` claim from a Supabase access-token JWT. No network and no
// signature check here: identity is already verified upstream (getUser), and
// session_id is a non-security-critical binding value for the self-harmless pass.
export function sessionIdFromAccessToken(accessToken: string | undefined | null): string | null {
  if (!accessToken) return null;
  try {
    const part = accessToken.split(".")[1];
    if (!part) return null;
    let b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    b64 += "=".repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(b64)) as { session_id?: string };
    return claims.session_id ?? null;
  } catch {
    return null;
  }
}

export const ONBOARDING_COOKIES = { PASS_COOKIE, ONBOARDED_COOKIE };

// httpOnly (JS can't read it), lax (survives top-level navigation), path "/" (the
// gate runs everywhere). No Max-Age -> session cookie. Secure only in production so
// the flow still works over http on localhost.
export const ONBOARDING_COOKIE_OPTIONS = {
  httpOnly: true as const,
  sameSite: "lax" as const,
  path: "/",
  secure: process.env.NODE_ENV === "production",
};
