// Server-side enforcement of the per-visitor demo session's hard one-hour life.
// Each demo entry mints a fresh anonymous Supabase user and records its
// demo_users row; from that row's created_at the account is usable for exactly
// DEMO_SESSION_TTL_MS, computed per user. The chat route and the mechanical
// PATCH/DELETE mutation routes call demoExpiredGate before any read/write so an
// expired demo turn is refused with { demoExpired: true } and never mutates data.
// Real accounts have no demo_users row, so the gate is a no-op for them.

import { NextResponse } from "next/server";
import type { createServerSupabase } from "@/lib/supabase";

// Hard demo session length — one hour from the demo_users row's created_at.
export const DEMO_SESSION_TTL_MS = 60 * 60 * 1000;

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

// Returns a 403 { demoExpired: true } response when `userId` belongs to a demo
// account whose hour has elapsed, or null when the request may proceed — i.e. the
// user is not a demo account, or is still inside its hour. Fails open: a lookup
// error returns null so a transient hiccup can never wall a real user.
export async function demoExpiredGate(
  supabase: ServiceClient,
  userId: string,
  now: number = Date.now(),
): Promise<NextResponse | null> {
  // Read created_at + visitor_id, but if the visitor_id column doesn't exist yet
  // (DEMO_ENABLED flipped on before the migration ran) the combined select errors —
  // retry on created_at alone so the gate degrades to the legacy per-user clock
  // rather than failing OPEN and silently disabling the wall for every demo turn.
  let createdStr: string | null = null;
  let visitorId: string | null = null;
  const combined = await supabase
    .from("demo_users").select("created_at, visitor_id").eq("user_id", userId).maybeSingle();
  if (!combined.error) {
    if (!combined.data) return null; // no demo row → real user, proceed
    createdStr = (combined.data as { created_at: string }).created_at;
    visitorId = (combined.data as { visitor_id?: string | null }).visitor_id ?? null;
  } else {
    const basic = await supabase
      .from("demo_users").select("created_at").eq("user_id", userId).maybeSingle();
    if (basic.error || !basic.data) return null; // real user or a transient miss → fail open
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
  if (Number.isNaN(startMs)) return null;
  if (now - startMs > DEMO_SESSION_TTL_MS) {
    return NextResponse.json({ demoExpired: true }, { status: 403 });
  }
  return null;
}
