import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { generateInsight } from "@/lib/insight-generator";

validateEnv();

const INSIGHT_CC = { headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=86400" } };

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  // 1. Return cached insight if still valid
  const { data: cached } = await supabase
    .from("highlights")
    .select("detail, expires_at")
    .eq("user_id", user.id)
    .eq("type", "insight")
    .gt("expires_at", now)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.detail) {
    return NextResponse.json({ detail: cached.detail, expires_at: cached.expires_at }, INSIGHT_CC);
  }

  // 2. Fetch the user's assets to build context
  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", user.id)
    .order("value", { ascending: false });

  if (!assets || assets.length === 0) {
    return NextResponse.json({ detail: null }, INSIGHT_CC);
  }

  // 3. Generate a fresh insight via Claude Haiku
  const detail = await generateInsight(assets);
  if (!detail) {
    return NextResponse.json({ detail: null }, INSIGHT_CC);
  }

  // 4. Cache for 24 hours — best-effort, do not throw on failure
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("highlights")
    .insert({ user_id: user.id, type: "insight", detail, expires_at: expiresAt, seen: false });

  return NextResponse.json({ detail, expires_at: expiresAt }, INSIGHT_CC);
}
