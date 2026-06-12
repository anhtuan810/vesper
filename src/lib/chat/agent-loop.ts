// Server-side tool-calling chat loop (flag-gated). Claude converses over the recent
// thread and calls deterministic tools for every figure and every write; the loop
// executes tools server-side and feeds results back until a final text message.
// Reuses the existing rate limit, history window, image input, cards, and — for
// writes — the proven mutation path. The big tag rulebook is gone.

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { type DisplayCurrency } from "@/lib/money";
import { validateNarration } from "@/lib/narrate/guardrail";
import { stripTags, timestampedPair } from "@/lib/chat-helpers";
import { CHAT_DAILY_LIMIT } from "@/lib/constants";
import { generateMarketContext } from "@/lib/market-context";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { generateInsight } from "@/lib/insight-generator";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { AGENT_TOOLS, executeAgentTool, type ToolContext, type CommitOutcome } from "@/lib/chat/agent-tools";
import { AGENT_MAX_TOOL_ROUNDTRIPS } from "@/lib/chat/agent-config";
import type { ScenarioResult } from "@/lib/scenario/result";

const anthropic = new Anthropic();
const MODEL = "claude-sonnet-4-6";

const SYSTEM = `You are Volnar's portfolio assistant. Converse naturally, briefly, and calmly — banker-quiet, no emoji, no exclamation marks, no hedging.

FORMATTING: mark the load-bearing parts of a reply so it scans — **bold** for the key figures (amounts, percentages, dates) and position names the sentence turns on, *italics* sparingly for a word of emphasis. Most sentences need neither. No other markdown: no headers, no code blocks, no tables, no links.

You reason over the conversation, but you NEVER compute a figure yourself and you NEVER change the portfolio yourself. Call tools for every number and every write, and state only numbers a tool returned (verbatim).

Reading the portfolio: get_net_worth, get_holdings, get_vitals.
What-ifs (read-only, never mutate): present_scenario (rearrange current holdings), future_projection (project forward or solve for a contribution), counterfactual (a HELD tradeable's contribution), hypothetical_buy (standalone growth of a past purchase of any asset, held or not).
- hypothetical_buy: "N {asset}" (e.g. "1 BTC") is units; "{money} in {asset}" is a cash amount. Never both. A bare number next to an asset name is units, not money.
- Relate a scenario answer to the user's current net worth when it helps (the tools return it).

Changes to the portfolio: a STATED COMPLETED ACTION ("I sold 2 ASML", "I bought €5k of Nvidia", "add my apartment") is real. Call propose_mutation to surface a confirmable proposal — this does NOT write. Only after the user explicitly confirms (e.g. "Confirm and save") call commit_mutation. A "what if" is never a mutation.

TRADEABLE ADDS — commit directly, no proposal step: when the user states they hold N units of a stock/ETF/crypto/gold ("I have 100 Apple", "I bought 100 shares of Apple from Jan 2020", "100 ASML, just track from now"), call commit_mutation directly (action "add", resolved symbol, units, buy_date if given). Do NOT call propose_mutation first and do NOT ask the user to confirm — this is a portfolio tracker, not a tax tool, and recording what someone owns needs no review step. Before calling it, the only things you may ask about are:
  - Quantity, ONLY if the number is genuinely ambiguous between a unit count and a money amount (e.g. "10000 Apple" — 10,000 shares or $10,000?). If the user says "shares"/"units"/"stocks", or gives no number at all, it's not ambiguous — use it as units, or ask for a quantity if none was given.
  - Acquisition date, ONLY if none was given at all. Accept any form (a year, a year-month, a full date, or "track from now") and move on immediately — never ask for more precision.
Never ask about cost basis or buy price in any form — the system fills it in silently from market data when a date is known, with no annotation. Once quantity and date are settled (or you're not asking about either), call commit_mutation THIS turn — never end a turn with only an acknowledgment and no tool call. After it succeeds, reply with one short confirmation line (e.g. "Logged Apple — 100 shares from Jan 2020.") and nothing else: no cost-basis mention, no "would you like to add another".
Value-mode adds (a money amount, no units) and all edits/removes still go through propose_mutation → commit_mutation as before.

If a tool returns needsClarification, ask the user its question naturally and stop — do not guess. Keep answers to a few sentences.`;

export interface AgentChatInput {
  userId: string;
  message: string;
  images: Array<{ base64: string; mediaType: string }>;
  recentMessages: Array<{ role: string; content: string }>;
  currentAssets: Array<Record<string, unknown>>;
  displayCurrency: DisplayCurrency;
  used: number;
  profile: Record<string, unknown>;
  userName?: string;
  fingerprint: string | null;
  isNewUser: boolean;
}

export interface AgentChatResult {
  message: string;
  scenarioResult?: ScenarioResult | null;
  suggested_replies?: string[] | null;
  assets?: unknown;
  remaining: number;
  analyticsEvent?: string;
}

function textFrom(content: Anthropic.Messages.ContentBlock[]): string {
  return content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export async function runAgentChat(input: AgentChatInput): Promise<AgentChatResult> {
  const supabase = createServerSupabase();
  const usdRates = await getUsdRates();
  const ctx: ToolContext = {
    supabase,
    userId: input.userId,
    displayCurrency: input.displayCurrency,
    usdRates,
    currentAssets: input.currentAssets,
    now: new Date(),
  };

  // Recent thread (existing window) so follow-ups and corrections land in context.
  const history: Anthropic.Messages.MessageParam[] = input.recentMessages
    .map((m) => ({ role: m.role as "user" | "assistant", content: stripTags(m.content) }))
    .filter((m) => m.content.length > 0);

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  for (const img of input.images) {
    userContent.push({ type: "image", source: { type: "base64", media_type: img.mediaType as "image/png", data: img.base64 } });
  }
  userContent.push({ type: "text", text: input.message || "Extract all positions from this screenshot and add them to my portfolio." });

  const messages: Anthropic.Messages.MessageParam[] = [...history, { role: "user", content: userContent }];

  // Accumulated across tool round-trips.
  const figures: string[] = [];
  let card: ScenarioResult | null = null;
  let chips: string[] | null = null;
  let commit: CommitOutcome | null = null;
  let finalText = "";

  for (let round = 0; round < AGENT_MAX_TOOL_ROUNDTRIPS; round++) {
    let resp: Anthropic.Messages.Message;
    try {
      // Top-level cache_control marks the last cacheable block, so each tool
      // round-trip (and each follow-up turn) reads the tools+system+history
      // prefix from cache instead of re-paying full input price for it.
      resp = await anthropic.messages.create({ model: MODEL, max_tokens: 1500, system: SYSTEM, tools: AGENT_TOOLS, messages, cache_control: { type: "ephemeral" } });
    } catch (err) {
      Sentry.captureException(err, { tags: { route: "agent-chat" } });
      return { message: "Couldn't reach the assistant. Please try again.", remaining: CHAT_DAILY_LIMIT - input.used };
    }

    messages.push({ role: "assistant", content: resp.content });
    const toolUses = resp.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      finalText = textFrom(resp.content);
      break;
    }

    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let outcome;
      try {
        outcome = await executeAgentTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
      } catch (err) {
        Sentry.captureException(err, { tags: { route: "agent-chat", tool: tu.name } });
        outcome = { forModel: { error: "That calculation failed — try a different phrasing?" } };
      }
      if (outcome.figures) figures.push(...outcome.figures);
      if (outcome.card) card = outcome.card;
      if (outcome.proposal) chips = outcome.proposal.chips;
      if (outcome.commit) commit = outcome.commit;
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.forModel) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (!finalText) finalText = "Here's what I found.";

  // Numeric guardrail, defense-in-depth: if the prose asserts a number no tool
  // returned, drop the prose (the card, if any, carries the deterministic truth).
  if (figures.length > 0 && !validateNarration(finalText, figures)) {
    Sentry.captureMessage("agent narration failed numeric guardrail", "warning");
    finalText = card ? "Here are the figures from the calculation:" : "Let me double-check those numbers — could you rephrase the question?";
  }

  // ── Post-commit side effects (the proven background jobs) ───────────────────
  let updatedAssets: unknown = null;
  let analyticsEvent: string | undefined;
  if (commit?.changed) {
    const { data: refreshed } = await supabase.from("assets").select("*").eq("user_id", input.userId).is("removed_at", null);
    updatedAssets = refreshed;
    if (commit.analyticsEvent) analyticsEvent = commit.analyticsEvent;

    if (commit.mutationMetas.length > 0) {
      after(async () => {
        try {
          const sb = createServerSupabase();
          for (const meta of commit.mutationMetas) {
            const c = await generateMarketContext(meta.symbol, meta.occurredAt, meta.assetType);
            if (c) await sb.from("mutations").update({ market_context: c }).eq("id", meta.id);
          }
        } catch (err) { Sentry.captureException(err, { tags: { background: "agent-market-context" } }); }
      });
    }
    after(async () => { try { await writeSnapshot(input.userId); } catch (err) { Sentry.captureException(err, { tags: { background: "agent-snapshot" } }); } });
    if (commit.needsBackfill) after(async () => { try { await backfillSnapshots(input.userId, commit.rebuildFrom); } catch (err) { Sentry.captureException(err, { tags: { background: "agent-backfill" } }); } });
    after(async () => {
      try {
        const sb = createServerSupabase();
        await sb.from("highlights").delete().eq("user_id", input.userId).eq("type", "pulse");
        await sb.from("highlights").delete().eq("user_id", input.userId).eq("type", "insight");
        const list = (refreshed ?? []) as unknown[];
        if (list.length === 0) return;
        const detail = await generateInsight(list as never);
        if (!detail) return;
        await sb.from("highlights").insert({ user_id: input.userId, type: "insight", detail, expires_at: new Date(Date.now() + 86400_000).toISOString(), seen: false });
      } catch (err) { Sentry.captureException(err, { tags: { background: "agent-insight" } }); }
    });
    after(async () => {
      try { await extractProfileUpdate(input.userId, input.message, finalText, input.profile, input.fingerprint, (refreshed ?? []).length); }
      catch (err) { Sentry.captureException(err, { tags: { background: "agent-profile" } }); }
    });
  }

  // Persist the turn. tool_result stores the card so it rehydrates on reload.
  await supabase.from("messages").insert(
    timestampedPair(
      { user_id: input.userId, role: "user", content: input.message || "[screenshot uploaded]" },
      { user_id: input.userId, role: "assistant", content: finalText, suggested_replies: chips, tool_result: card ?? null },
    ),
  );

  return {
    message: finalText,
    scenarioResult: card,
    suggested_replies: chips,
    assets: updatedAssets,
    remaining: CHAT_DAILY_LIMIT - input.used,
    ...(analyticsEvent ? { analyticsEvent } : {}),
  };
}
