// Server-side enforcement of the per-visitor demo session's hard 30-minute life.
// Each demo entry mints a fresh anonymous Supabase user and records its
// demo_users row; from that row's created_at the account is usable for exactly
// DEMO_SESSION_TTL_MS, computed per user. The chat route and the mechanical
// PATCH/DELETE mutation routes call demoExpiredGate before any read/write so an
// expired demo turn is refused with { demoExpired: true } and never mutates data.
// Real accounts have no demo_users row, so the gate is a no-op for them.

import { NextResponse } from "next/server";
import type { createServerSupabase } from "@/lib/supabase";

// Hard demo session length — 30 minutes from the demo_users row's created_at
// (owner call 2026-07-11; was one hour). The client wall/countdown reads the
// deadline from the demo_expires_at cookie, so the binary needs no change.
export const DEMO_SESSION_TTL_MS = 30 * 60 * 1000;

// The reaper waits this much past expiry before wiping an account, so a turn that
// lands right at the boundary is walled (demoExpired) rather than served against a
// half-deleted account. The cron's cadence has no effect on session length — that
// is governed solely by the TTL above, per user.
export const DEMO_SESSION_GRACE_MS = 15 * 60 * 1000;

// The persistent `demo_visitor` cookie's life — how long a browser stays bound to
// its trial. Re-entering within this window reuses the same deadline (no reset);
// once expired the browser is treated as new. Server keeps the matching tombstone.
export const DEMO_VISITOR_COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// How long demo_visitors rows are retained before the reaper prunes them. Kept
// longer than the cookie so the tombstone always outlives the cookie that points
// at it (a live cookie must never find a missing visitor and get a fresh trial).
export const DEMO_VISITOR_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

type ServiceClient = ReturnType<typeof createServerSupabase>;

export interface DemoSessionStatus {
  /** True when userId has a demo_users row — a per-visitor demo account. */
  isDemo: boolean;
  /** True when that demo account's session window has elapsed. Always false for real users. */
  expired: boolean;
}

// Looks up whether `userId` is a per-visitor demo account and whether its
// session window has elapsed — one demo_users read, shared by the 403 gate and
// the demo chat cap. Fails open ({ isDemo:false, expired:false }) on any lookup error so a
// transient hiccup can never wall or down-limit a real user.
export async function getDemoSessionStatus(
  supabase: ServiceClient,
  userId: string,
  now: number = Date.now(),
): Promise<DemoSessionStatus> {
  const NOT_DEMO: DemoSessionStatus = { isDemo: false, expired: false };

  // Read created_at + visitor_id, but if the visitor_id column doesn't exist yet
  // (DEMO_ENABLED flipped on before the migration ran) the combined select errors —
  // retry on created_at alone so the gate degrades to the legacy per-user clock
  // rather than failing OPEN and silently disabling the wall for every demo turn.
  let createdStr: string | null = null;
  let visitorId: string | null = null;
  const combined = await supabase
    .from("demo_users").select("created_at, visitor_id").eq("user_id", userId).maybeSingle();
  if (!combined.error) {
    if (!combined.data) return NOT_DEMO; // no demo row → real user
    createdStr = (combined.data as { created_at: string }).created_at;
    visitorId = (combined.data as { visitor_id?: string | null }).visitor_id ?? null;
  } else {
    const basic = await supabase
      .from("demo_users").select("created_at").eq("user_id", userId).maybeSingle();
    if (basic.error || !basic.data) return NOT_DEMO; // real user or a transient miss → fail open
    createdStr = (basic.data as { created_at: string }).created_at;
  }

  // The trial clock runs from the visitor's FIRST entry, so a demo re-entered in
  // the same browser shares one deadline rather than resetting. Falls back to this
  // user's own created_at (native demo with no visitor, or a pruned tombstone).
  let startMs = Date.parse(createdStr);
  if (visitorId) {
    const { data: v } = await supabase
      .from("demo_visitors")
      .select("first_seen")
      .eq("visitor_id", visitorId)
      .maybeSingle();
    if (v?.first_seen) {
      const m = Date.parse(v.first_seen as string);
      if (!Number.isNaN(m)) startMs = m;
    }
  }
  if (Number.isNaN(startMs)) return { isDemo: true, expired: false };
  return { isDemo: true, expired: now - startMs > DEMO_SESSION_TTL_MS };
}

// Returns a 403 { demoExpired: true } response when `userId` belongs to a demo
// account whose session window has elapsed, or null when the request may
// proceed — i.e. the user is not a demo account, or is still inside its window.
// Fails open: a lookup error returns null so a transient hiccup can never wall
// a real user.
export async function demoExpiredGate(
  supabase: ServiceClient,
  userId: string,
  now: number = Date.now(),
): Promise<NextResponse | null> {
  const status = await getDemoSessionStatus(supabase, userId, now);
  if (status.expired) {
    return NextResponse.json({ demoExpired: true }, { status: 403 });
  }
  return null;
}

// ── Per-IP cap on demo-session minting ────────────────────────────────────────
// Every per-visitor demo entry creates a fresh anonymous account with its own
// chat allowance, so unthrottled minting is an Anthropic-spend amplifier. Cap
// entries per IP per hour, server-side, at both mint points (/demo on web,
// POST /api/demo-session on native).

export const DEMO_SESSION_IP_HOURLY_LIMIT = 3;

// Client IP as the platform reports it. On Vercel the first x-forwarded-for
// entry is set by the platform and can't be spoofed by the caller. Null when
// no header is present (local dev) — the limiter then allows the mint.
export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  const real = headers.get("x-real-ip")?.trim();
  return real || null;
}

// True when this IP may mint another demo session this hour. Counts via the
// demo_ip_limits table (see migration 20260711_demo_ip_limits.sql), keyed by
// sha256(ip) — no raw IP is ever stored — and a fixed UTC hour bucket. Fails
// OPEN: before the migration is applied (or on any transient error) the demo
// keeps working unthrottled, matching how every hand-applied migration here
// degrades. Old hour rows are pruned by the reap-demo cron.
export async function demoMintAllowed(
  supabase: ServiceClient,
  ip: string | null,
  now: number = Date.now(),
): Promise<boolean> {
  if (!ip) return true;
  try {
    const { createHash } = await import("node:crypto");
    const ipHash = createHash("sha256").update(ip).digest("hex");
    const hour = new Date(now).toISOString().slice(0, 13); // "2026-07-10T20" (UTC)
    const { data, error } = await supabase.rpc("increment_demo_ip_limit", {
      p_ip_hash: ipHash,
      p_hour: hour,
    });
    if (error || typeof data !== "number") return true; // RPC missing / transient → fail open
    return data <= DEMO_SESSION_IP_HOURLY_LIMIT;
  } catch {
    return true;
  }
}
