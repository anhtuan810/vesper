import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

// Records the one-time AI data-sharing acknowledgment for the current user. The
// timestamp is server-set (now()) and never taken from the request body, so it
// cannot be spoofed. Idempotent: if ai_consent_at is already set, the existing
// value is preserved and returned unchanged.
export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  // Read first so a repeat call never overwrites an earlier acknowledgment with
  // a fresh timestamp.
  const { data: existing, error: readError } = await supabase
    .from("users")
    .select("ai_consent_at")
    .eq("id", user.id)
    .single();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  if (existing?.ai_consent_at) {
    return NextResponse.json({ ok: true, ai_consent_at: existing.ai_consent_at });
  }

  const now = new Date().toISOString();
  // The `is null` guard makes the write a no-op under a concurrent set, so the
  // first acknowledgment wins.
  const { error } = await supabase
    .from("users")
    .update({ ai_consent_at: now })
    .eq("id", user.id)
    .is("ai_consent_at", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ai_consent_at: now });
}
