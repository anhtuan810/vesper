import { NextResponse } from "next/server";
import type { createServerSupabase } from "@/lib/supabase";

type ServiceClient = ReturnType<typeof createServerSupabase>;

// Atomic per-user daily rate limit via the shared increment_rate_limit RPC
// (service-role only; see 20260615_security_advisor_hardening.sql). Buckets are
// arbitrary strings partitioned by (user_id, bucket, date), so a new limited
// surface needs no migration — just a fresh bucket name.
//
// Returns the new count for today, or null when the limiter is unreachable so
// the caller can decide how to degrade.
export async function bumpRateLimit(
  supabase: ServiceClient,
  userId: string,
  bucket: string,
): Promise<number | null> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_bucket: bucket,
    p_date: today,
  });
  return error || data == null ? null : (data as number);
}

// Convenience gate: a 429 NextResponse once the user passes `limit` for `bucket`
// today, else null. Fails OPEN (returns null) if the limiter can't be reached —
// a transient DB error must never lock out a legitimate user, and the hard
// request-shape caps (array length, bounded concurrency) remain the real
// backstop against amplification.
export async function rateLimitGate(
  supabase: ServiceClient,
  userId: string,
  bucket: string,
  limit: number,
): Promise<NextResponse | null> {
  const count = await bumpRateLimit(supabase, userId, bucket);
  if (count != null && count > limit) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429 },
    );
  }
  return null;
}
