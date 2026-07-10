import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { demoExpiredGate } from "@/lib/demo-session";
import { CHAT_MODEL } from "@/lib/chat/agent-config";
import type { PortfolioChange } from "@/lib/apply-changes";

// Headless vision extraction for the reusable asset collector: turn broker /
// exchange / bank screenshots (and PDF statements) into structured holdings the
// collector shows in an editable confirm card. This reuses the chat's vision
// approach — the same model and image blocks — but as a single, non-streaming
// tool-forced call, so it works inside the gated onboarding flow (where the chat
// route is itself unreachable) and returns rows to confirm rather than committing.
// Nothing is persisted here; the collector persists via POST /api/assets/create.

export const runtime = "nodejs";
export const maxDuration = 60;

const anthropic = new Anthropic();

const MAX_IMAGES = 8;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const EXTRACT_TOOL: Anthropic.Messages.Tool = {
  name: "extract_holdings",
  description: "Report every distinct portfolio holding visible in the provided images/statements.",
  input_schema: {
    type: "object",
    properties: {
      holdings: {
        type: "array",
        description: "One entry per distinct position visible. Empty if none.",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "Display name or ticker. Never empty (a company name, or the coin/ticker)." },
            type: { type: "string", enum: ["stocks", "etf", "crypto", "gold", "cash", "bonds", "other"] },
            symbol: { type: "string", description: "Market ticker for a tradeable (AAPL, BTC, VWCE.DE)." },
            units: { type: "number", description: "Quantity held (shares / coins). Record when shown." },
            value: { type: "number", description: "Current monetary value shown for the position, in its listed currency." },
            currency: { type: "string", enum: ["EUR", "USD", "GBP"] },
            buy_price: { type: "number", description: "Purchase price per unit — ONLY if explicitly shown." },
            buy_date: { type: "string", description: "Acquisition date — ONLY if explicitly shown." },
          },
          required: ["name", "type"],
        },
      },
    },
    required: ["holdings"],
  },
};

const EXTRACT_SYSTEM = `You extract investment and account holdings from screenshots or statements — broker apps, crypto exchanges, and bank/savings apps. Call extract_holdings with EVERY distinct position visible.

Rules:
- Use each position's own listed currency (EUR/USD/GBP).
- Stock/ETF: put the ticker in "symbol" and the company/fund name in "name"; type "stocks" for a listed equity, "etf" for a fund/ETF.
- Crypto: use the coin ticker (BTC, ETH, SOL) as both "name" and "symbol"; type "crypto".
- Record "units" (share/coin quantity) when shown; otherwise record the current "value".
- A cash/savings balance: type "cash", the shown balance as "value", the account label as "name".
- Do NOT invent positions, tickers, prices, or dates you cannot see. Omit buy_date/buy_price unless explicitly shown.
- If no holdings are visible, return an empty holdings array.`;

type RawHolding = {
  name?: unknown;
  type?: unknown;
  symbol?: unknown;
  units?: unknown;
  value?: unknown;
  currency?: unknown;
  buy_price?: unknown;
  buy_date?: unknown;
};

const VALID_TYPES = new Set(["stocks", "etf", "crypto", "gold", "cash", "bonds", "other"]);

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Wall an expired demo turn before spending a model call.
    const demoGate = await demoExpiredGate(createServerSupabase(), user.id);
    if (demoGate) return demoGate;

    const body = await req.json();
    const images: Array<{ base64: string; mediaType: string }> = Array.isArray(body?.images) ? body.images : [];
    const pdfs: Array<{ base64: string }> = Array.isArray(body?.pdfs) ? body.pdfs : [];
    if (images.length === 0 && pdfs.length === 0) {
      return NextResponse.json({ error: "No images or statements provided" }, { status: 400 });
    }
    if (images.length + pdfs.length > MAX_IMAGES) {
      return NextResponse.json({ error: `Please upload at most ${MAX_IMAGES} at once` }, { status: 400 });
    }

    const content: Anthropic.Messages.ContentBlockParam[] = [];
    for (const img of images) {
      if (typeof img?.base64 !== "string" || !img.base64) continue;
      const mediaType = ALLOWED_IMAGE_TYPES.has(img.mediaType) ? img.mediaType : "image/jpeg";
      content.push({
        type: "image",
        source: { type: "base64", media_type: mediaType as "image/jpeg", data: img.base64 },
      });
    }
    for (const pdf of pdfs) {
      if (typeof pdf?.base64 !== "string" || !pdf.base64) continue;
      content.push({
        type: "document",
        source: { type: "base64", media_type: "application/pdf", data: pdf.base64 },
      });
    }
    if (content.length === 0) {
      return NextResponse.json({ error: "No readable images or statements provided" }, { status: 400 });
    }
    content.push({ type: "text", text: "Extract every holding you can see." });

    const response = await anthropic.messages.create({
      model: CHAT_MODEL,
      max_tokens: 2000,
      system: EXTRACT_SYSTEM,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_holdings" },
      messages: [{ role: "user", content }],
    });

    const toolUse = response.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
    );
    const rawHoldings: RawHolding[] = Array.isArray((toolUse?.input as { holdings?: RawHolding[] })?.holdings)
      ? ((toolUse!.input as { holdings: RawHolding[] }).holdings)
      : [];

    const changes: PortfolioChange[] = [];
    for (const h of rawHoldings) {
      const name = typeof h.name === "string" ? h.name.trim() : "";
      const type = typeof h.type === "string" && VALID_TYPES.has(h.type) ? h.type : "other";
      if (!name) continue;
      const change: PortfolioChange = { action: "add", name, type };
      if (typeof h.symbol === "string" && h.symbol.trim()) change.symbol = h.symbol.trim();
      if (typeof h.units === "number" && Number.isFinite(h.units) && h.units > 0) change.units = h.units;
      if (typeof h.value === "number" && Number.isFinite(h.value) && h.value > 0) change.value = h.value;
      if (h.currency === "EUR" || h.currency === "USD" || h.currency === "GBP") change.currency = h.currency;
      if (typeof h.buy_price === "number" && Number.isFinite(h.buy_price) && h.buy_price > 0) change.buy_price = h.buy_price;
      if (typeof h.buy_date === "string" && h.buy_date.trim()) change.buy_date = h.buy_date.trim();
      changes.push(change);
    }

    return NextResponse.json({ changes });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "POST /api/assets/parse" } });
    return NextResponse.json({ error: "Couldn't read that — try a clearer screenshot, or type it instead." }, { status: 500 });
  }
}
