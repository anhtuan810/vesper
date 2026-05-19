import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { generateInsight } from "@/lib/insight-generator";
import { parseMarketDetail } from "@/lib/market-highlights";

validateEnv();

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const now = new Date().toISOString();

  // Fetch portfolio cards, insight fallback, and market highlights in parallel
  const [portfolioRes, insightRes, marketRes] = await Promise.all([
    supabase
      .from("highlights")
      .select("detail")
      .eq("user_id", user.id)
      .eq("type", "portfolio")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("highlights")
      .select("detail, expires_at")
      .eq("user_id", user.id)
      .eq("type", "insight")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("highlights")
      .select("id, title, detail")
      .eq("user_id", user.id)
      .eq("type", "market")
      .gt("expires_at", now)
      .order("created_at", { ascending: false })
      .limit(3),
  ]);

  const portfolio = (portfolioRes.data ?? []).map((r) => r.detail ?? "").filter(Boolean);

  const market = (marketRes.data ?? []).map((row) => {
    const { text, impact_eur, symbol } = parseMarketDetail(row.detail ?? "");
    return { id: row.id, title: row.title ?? "", detail: text, impact_eur, symbol };
  });

  // If portfolio cards exist, return immediately — no need for legacy insight
  if (portfolio.length > 0) {
    return NextResponse.json({ portfolio, insight: { detail: null }, market });
  }

  // Fall back to cached legacy insight
  if (insightRes.data?.detail) {
    return NextResponse.json({
      portfolio: [],
      insight: { detail: insightRes.data.detail, expires_at: insightRes.data.expires_at },
      market,
    });
  }

  // On-demand generation: fetch assets and run Haiku free-form insight
  const { data: assets } = await supabase
    .from("assets")
    .select("*")
    .eq("user_id", user.id)
    .order("value", { ascending: false });

  if (!assets || assets.length === 0) {
    return NextResponse.json({ portfolio: [], insight: { detail: null }, market });
  }

  const detail = await generateInsight(assets);
  if (!detail) {
    return NextResponse.json({ portfolio: [], insight: { detail: null }, market });
  }

  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await supabase
    .from("highlights")
    .insert({ user_id: user.id, type: "insight", detail, expires_at: expiresAt, seen: false });

  return NextResponse.json({ portfolio: [], insight: { detail, expires_at: expiresAt }, market });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  await supabase.from("highlights").delete().eq("user_id", user.id).eq("type", "insight");

  return NextResponse.json({ ok: true });
}
