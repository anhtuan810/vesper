import * as Sentry from "@sentry/nextjs";
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { validateEnv } from "@/lib/env";
import { getEurRates } from "@/lib/fx";
import { isSupportedCurrency, type DisplayCurrency } from "@/lib/money";

validateEnv();

const anthropic = new Anthropic();
const DAILY_LIMIT = 100;

/** Format a EUR-stored value in the user's display currency using server-side rates. */
function fmtDisplay(eurValue: number, currency: DisplayCurrency, rates: Record<string, number>): string {
  if (currency === "EUR") {
    return `€${Math.round(eurValue).toLocaleString("en")}`;
  }
  const rate = rates[currency] ?? 1;
  const displayValue = Math.round(eurValue * rate);
  const sym = currency === "USD" ? "$" : "£";
  return `${sym}${displayValue.toLocaleString("en")}`;
}

type MutationRow = {
  action: string;
  asset_name: string;
  before_value: number | null;
  after_value: number | null;
  currency: string | null;
  occurred_at: string | null;
  personal_context: string | null;
};

export async function POST(req: NextRequest) {
  try {
    // 1. Auth
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const supabase = createServerSupabase();

    // 2. Parse body
    const text = await req.text();
    if (!text) return NextResponse.json({ error: "No input" }, { status: 400 });
    const { mutations, startVal, endVal, periodLabel } = JSON.parse(text);

    // 3. Bail on invalid
    if (!mutations || mutations.length === 0) {
      return NextResponse.json({ error: "No mutations" }, { status: 400 });
    }

    // 4. Fetch user (display currency)
    const { data: userData } = await supabase
      .from("users")
      .select("display_currency")
      .eq("id", user.id)
      .single();
    const displayCurrency: DisplayCurrency = isSupportedCurrency(userData?.display_currency)
      ? (userData?.display_currency as DisplayCurrency)
      : "EUR";

    // 5. Compute cache key
    const mutationsForHash = (mutations as MutationRow[])
      .map((m) =>
        `${m.action}|${m.asset_name}|${m.before_value}|${m.after_value}|${m.currency}|${m.occurred_at}|${m.personal_context ?? ""}`
      )
      .sort()
      .join("::");
    const cacheKey = createHash("sha256")
      .update(`${displayCurrency}|${periodLabel}|${startVal}|${endVal}|${mutationsForHash}`)
      .digest("hex");

    // 6. Cache lookup
    const { data: cached } = await supabase
      .from("diary_summaries")
      .select("summary")
      .eq("user_id", user.id)
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.summary) {
      return NextResponse.json({ summary: cached.summary });
    }

    // 7. Rate limit (only when missing cache)
    const today = new Date().toISOString().slice(0, 10);
    const { data: newCount } = await supabase.rpc("increment_rate_limit", {
      p_user_id: user.id,
      p_bucket: "diary",
      p_date: today,
    });
    if ((newCount as number) > DAILY_LIMIT) {
      return NextResponse.json({ error: "Daily limit reached" }, { status: 429 });
    }

    // 8. Build prompt + call Claude
    const rates = await getEurRates();
    const fmt = (v: number) => fmtDisplay(v, displayCurrency, rates);

    const change = endVal - startVal;
    const changePct = startVal > 0 ? ((change / startVal) * 100).toFixed(1) : "0";

    const lines = (mutations as MutationRow[])
      .map((m) => {
        const date = m.occurred_at ? ` (${m.occurred_at})` : "";
        const ctx = m.personal_context ? ` — "${m.personal_context}"` : "";
        if (m.action === "add")
          return `Added ${m.asset_name}: ${fmt(m.after_value ?? 0)}${date}${ctx}`;
        if (m.action === "edit")
          return `Updated ${m.asset_name}: ${fmt(m.before_value ?? 0)} → ${fmt(m.after_value ?? 0)}${date}${ctx}`;
        if (m.action === "remove")
          return `Removed ${m.asset_name}: ${fmt(m.before_value ?? 0)}${date}${ctx}`;
        return null;
      })
      .filter(Boolean)
      .join("\n");

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 160,
      system: `You write ultra-short portfolio insights as bullet points.
3 bullets max. Each bullet: one short sentence, 10 words or fewer.
Be direct and specific. Focus on what changed and why it matters.
No greetings, no fluff, no emojis.
Format: start each line with "• "
Render all currency values in ${displayCurrency}.

Examples:
• Shifted focus toward US tech.
• Reduced European exposure significantly.
• Portfolio grew despite volatile markets.`,
      messages: [
        {
          role: "user",
          content: `Period: ${periodLabel}
Portfolio: started ${fmt(startVal)}, ended ${fmt(endVal)} (${change >= 0 ? "+" : ""}${fmt(change)}, ${change >= 0 ? "+" : ""}${changePct}%)

Activity:
${lines}

Give 3 bullet-point insights.`,
        },
      ],
    });

    const summary = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();

    // 9. Save to cache (best-effort)
    await supabase
      .from("diary_summaries")
      .upsert(
        { user_id: user.id, cache_key: cacheKey, summary },
        { onConflict: "user_id,cache_key" }
      );

    // 10. Return
    return NextResponse.json({ summary });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/diary-summary" } });
    return NextResponse.json({ summary: null });
  }
}
