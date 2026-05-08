import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthUser } from "@/lib/supabase";
import { currencySymbol } from "@/lib/utils";

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const text = await req.text();
    if (!text) return NextResponse.json({ summary: null });
    const { mutations, startVal, endVal, periodLabel, currency } = JSON.parse(text);
    const sym = currencySymbol(currency || "EUR");

    if (!mutations || mutations.length === 0) {
      return NextResponse.json({ summary: null });
    }

    const change = endVal - startVal;
    const changePct = startVal > 0 ? ((change / startVal) * 100).toFixed(1) : "0";

    const lines = (mutations as {
      action: string;
      asset_name: string;
      before_value: number | null;
      after_value: number | null;
      currency: string | null;
      occurred_at: string | null;
      personal_context: string | null;
    }[])
      .map((m) => {
        const mSym = currencySymbol(m.currency || currency || "EUR");
        const date = m.occurred_at ? ` (${m.occurred_at})` : "";
        const ctx = m.personal_context ? ` — "${m.personal_context}"` : "";
        if (m.action === "add")
          return `Added ${m.asset_name}: ${mSym}${(m.after_value ?? 0).toLocaleString()}${date}${ctx}`;
        if (m.action === "edit")
          return `Updated ${m.asset_name}: ${mSym}${(m.before_value ?? 0).toLocaleString()} → ${mSym}${(m.after_value ?? 0).toLocaleString()}${date}${ctx}`;
        if (m.action === "remove")
          return `Removed ${m.asset_name}: ${mSym}${(m.before_value ?? 0).toLocaleString()}${date}${ctx}`;
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

Examples:
• Shifted focus toward US tech.
• Reduced European exposure significantly.
• Portfolio grew despite volatile markets.`,
      messages: [
        {
          role: "user",
          content: `Period: ${periodLabel}
Portfolio: started ${sym}${(startVal).toLocaleString()}, ended ${sym}${(endVal).toLocaleString()} (${change >= 0 ? "+" : ""}${sym}${Math.abs(change).toLocaleString()}, ${change >= 0 ? "+" : ""}${changePct}%)

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

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Diary summary error:", err);
    return NextResponse.json({ summary: null });
  }
}
