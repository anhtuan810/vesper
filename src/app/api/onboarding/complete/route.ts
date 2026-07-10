import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import {
  signOnboarded,
  ONBOARDING_COOKIES,
  ONBOARDING_COOKIE_OPTIONS,
} from "@/lib/onboarding-pass";

// Marks the current user's gated onboarding as complete. Called when the user hits
// "Done" at the END of collection (NOT at the end of any Build-up / price fetch — a
// pricing hiccup must never trap anyone behind the gate). The timestamp is server-set
// (never from the request body) so it cannot be spoofed, and the write is read-first
// idempotent so a repeat "Done" never overwrites the original completion.
//
// Degrades gracefully before the migration is applied: if the column doesn't exist
// yet the DB write is skipped, but the signed fast-path cookie is still set so the
// user lands in the app — the middleware gate also fails open pre-migration, so this
// is consistent, and existing users are backfilled to complete by the migration.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  let completedAt: string | null = null;
  const { data: existing, error: readError } = await supabase
    .from("users")
    .select("onboarding_completed_at")
    .eq("id", user.id)
    .maybeSingle();

  completedAt =
    (existing as { onboarding_completed_at?: string | null } | null)?.onboarding_completed_at ?? null;

  if (!completedAt && !readError) {
    const now = new Date().toISOString();
    // `is null` guard keeps the first "Done" the winner under any concurrent set.
    const { error } = await supabase
      .from("users")
      .update({ onboarding_completed_at: now })
      .eq("id", user.id)
      .is("onboarding_completed_at", null);
    if (!error) completedAt = now;
  }

  const res = NextResponse.json({ ok: true, onboarding_completed_at: completedAt });
  // Fast-path marker so the gate can skip the per-navigation flag read.
  res.cookies.set(
    ONBOARDING_COOKIES.ONBOARDED_COOKIE,
    await signOnboarded(user.id),
    ONBOARDING_COOKIE_OPTIONS,
  );
  return res;
}
