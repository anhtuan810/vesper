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
  const { data, error } = await supabase
    .from("demo_users")
    .select("created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;

  const createdMs = Date.parse(data.created_at as string);
  if (Number.isNaN(createdMs)) return null;
  if (now - createdMs > DEMO_SESSION_TTL_MS) {
    return NextResponse.json({ demoExpired: true }, { status: 403 });
  }
  return null;
}
