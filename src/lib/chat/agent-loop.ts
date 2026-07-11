// Server-side tool-calling chat loop — the only chat engine. Claude converses
// over the recent thread and calls deterministic tools for every figure and every
// write; the loop executes tools server-side and feeds results back until a final
// text message.
// Reuses the existing rate limit, history window, image input, cards, and — for
// writes — the proven mutation path. The big tag rulebook is gone.

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { type DisplayCurrency } from "@/lib/money";
import { extractMonetaryNumbers, offendingMonetaryTokens, withPercentTolerance } from "@/lib/narrate/guardrail";
import { stripTags, timestampedPair } from "@/lib/chat-helpers";
import { generateMarketContext } from "@/lib/market-context";
import { mapWithConcurrency } from "@/lib/concurrency";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { generateMarketSwings } from "@/lib/diary-market-moves";
import { generateInsight } from "@/lib/insight-generator";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { AGENT_TOOLS, executeAgentTool, type ToolContext, type CommitOutcome } from "@/lib/chat/agent-tools";
import { figureLines, READ_TOOLS } from "@/lib/chat/figure-fallback";
import { AGENT_MAX_TOOL_ROUNDTRIPS, CHAT_MODEL } from "@/lib/chat/agent-config";
import type { ScenarioResult } from "@/lib/scenario/result";

const anthropic = new Anthropic();
const MODEL = CHAT_MODEL;

export const AGENT_SYSTEM = `You are Volnar's portfolio assistant. Converse naturally, briefly, and calmly — banker-quiet, no emoji, no exclamation marks, no hedging.

FORMATTING: make replies scan — **bold** every concrete figure (amounts, percentages, dates) and every position/asset name you mention, *italics* sparingly for a word of emphasis. No other markdown: no headers, no code blocks, no tables, no links.

You reason over the conversation, but you NEVER compute a figure yourself and you NEVER change the portfolio yourself. Call tools for every number and every write, and state only numbers that came from a tool result, from the user's own words, or from earlier in this conversation — never a number you derived or estimated yourself.
FIGURES ARE VERBATIM-ONLY: copy each one character-for-character as it appeared — same digits, same separators (they are pre-formatted for the user's locale; never re-punctuate "€12.345" into "€12,345"), same decimals. Never add, subtract, total, average, round a money amount, or convert figures yourself — if you want a total or a derived number, use the one the tool returned (get_holdings and get_vitals both return netWorth) or call the tool that has it. Prefer a fresh tool figure over one from earlier in the thread (the portfolio moves). A reply containing a number from nowhere is discarded unseen — when unsure, describe without the number.

Reading the portfolio: get_net_worth, get_holdings, get_vitals.
What-ifs (read-only, never mutate): present_scenario (rearrange current holdings), future_projection (project forward or solve for a contribution), counterfactual (a HELD tradeable's contribution), hypothetical_buy (standalone growth of a past purchase of any asset, held or not).
- hypothetical_buy: "N {asset}" (e.g. "1 BTC") is units; "{money} in {asset}" is a cash amount. Never both. A bare number next to an asset name is units, not money.
- Relate a scenario answer to the user's current net worth when it helps (the tools return it).

Changes to the portfolio: a STATED COMPLETED ACTION ("I sold 2 Tesla", "I bought €5k of Nvidia", "add my apartment") is real. Call propose_mutation to surface a confirmable proposal — this does NOT write. Only after the user explicitly confirms (e.g. "Confirm and save") call commit_mutation. A "what if" is never a mutation.

TRADEABLE ADDS — commit directly, no proposal step: when the user states they hold N units of a stock/ETF/crypto/gold ("I have 100 Apple", "I bought 100 shares of Apple from Jan 2020", "100 ASML, just track from now"), call commit_mutation directly. Every change MUST carry a non-empty "name" (the company/asset name or its ticker — e.g. "Apple" or "AAPL") plus action "add", the resolved symbol, units, and buy_date if given; a change with no name is dropped and nothing is saved. Do NOT call propose_mutation first and do NOT ask the user to confirm — this is a portfolio tracker, not a tax tool, and recording what someone owns needs no review step. Before calling it, the only things you may ask about are:
  - Quantity, ONLY if the number is genuinely ambiguous between a unit count and a money amount (e.g. "10000 Apple" — 10,000 shares or $10,000?). If the user says "shares"/"units"/"stocks", or gives no number at all, it's not ambiguous — use it as units, or ask for a quantity if none was given.
  - Acquisition date, ONLY if none was given at all. Accept any form (a year, a year-month, a full date, or "track from now") and move on immediately — never ask for more precision.
  - Do NOT ask which exchange or trading venue a stock or ETF is on — the user only needs to name the company or ticker, and can see venue detail in their broker app. Record a bare European/UCITS ETF ticker (e.g. VWCE, IWDA, EUNL) as-is; the system resolves the listing matching the user's currency automatically. You may still use a venue the user volunteers, or a dot-suffixed symbol they give (e.g. ZPRR.DE), but never ask for one.
Never ask about cost basis or buy price in any form — the system fills it in silently from market data when a date is known, with no annotation. Once quantity and date are settled (or you're not asking about either), call commit_mutation THIS turn — never end a turn with only an acknowledgment and no tool call. After it succeeds, reply with one short confirmation line (e.g. "Logged Apple — 100 shares from Jan 2020.") and nothing else: no cost-basis mention, no "would you like to add another".
Value-mode adds (a money amount, no units) and all edits/removes still go through propose_mutation → commit_mutation as before.

AFTER commit_mutation returns, narrate from ITS result — never re-read the portfolio to "check" the write; the result already carries the whole outcome, and the portfolio tools reflect the commit. If it reports \`couldNotRecord\`, name those positions and the exact reason given, and do NOT claim they were saved. If it reports \`alreadyInPortfolio\`, those are already tracked — reassure the user, treat it as success (not a failure), and never retry them. Report as saved only the positions actually committed.

BUYING MORE of a position the user ALREADY holds is an EDIT, never an add and never a no-op: commit an edit for that position with the NEW TOTAL units (their current units from get_holdings PLUS the amount bought), carrying buy_date if a date is given. Never just acknowledge — record it.

FILE IMPORT — when the turn includes broker screenshot(s), a PDF statement, or an imported CSV/table: extract every real holding row and commit them in ONE commit_mutation call (one "add" per position). Multiple screenshots (or a multi-page statement) are usually the SAME portfolio scrolled — a ticker appearing more than once is ONE holding; de-duplicate by ticker and emit each unique position exactly once (prefer the row with the clearest quantity). SKIP options/derivatives (rows with Put, Call, or an expiry like "JUL 24 '26"), cash-sweep/settlement rows, and account-total/summary rows. A position already in the portfolio is a units update (edit), not a re-add. After committing, ask ONCE for the batch's acquisition date ("A rough month or year is fine, or 'just track from now'"). On the reply — whatever it is, including "track from now" — call set_import_acquisition_date with the user's answer VERBATIM. That one call stamps the date onto every imported position that still lacks one; do NOT enumerate positions or issue per-position edits for this, and NEVER end that turn with only an acknowledgment and no tool call. The positions were committed dated today until this runs, so never claim they are "already dated" — the date is not applied until set_import_acquisition_date returns, and you narrate from its result (e.g. "Dated all 19 to 2 years ago.").

RECORDING PROPERTY, PENSIONS, CASH & OTHER NON-TRADEABLE ASSETS — each of these classes has a set of details Volnar needs, and an incomplete one must NEVER be saved with a silent default. When the user names such an asset, first tell them plainly what you need for it — a short bulleted list of the fields — then collect them, asking for anything still missing ONE question at a time, before you propose_mutation. Never guess or default a required field. Route these through propose_mutation (which echoes every captured field back for the user to confirm) and, only after they confirm, commit_mutation. If a tool returns needsClarification, ask exactly what it asks and stop.
- Property (real_estate): NEEDED — the address; its current value (for a Netherlands property the purchase price and date are enough — the system estimates today's value from them; for a property anywhere else, ask for the current value directly); and the mortgage. ALWAYS settle the mortgage question — pass mortgage_balance as the outstanding amount when there's a mortgage, or 0 ONLY when the user says it's owned free and clear; never assume owned outright. WHEN THERE IS A MORTGAGE (balance > 0), also collect the three fields the mortgage-free projection needs: the interest rate (mortgage_rate — pass 0 if it's interest-free), the monthly payment (monthly_payment), and the repayment type (mortgage_type: annuity, linear, or interest-only). For an interest-only mortgage also ask the end date (mortgage_end_date) — that's what gives it a payoff date. OPTIONAL — property type, size.
- Pension: NEEDED — which kind it is (a workplace/private pot [DC], a company defined-benefit [DB] scheme, or the State pension). For a DC pot: its current value, an annual growth assumption (pass it as mortgage_rate), and the age you can access it. For DB/State: the annual income it will pay. OPTIONAL — provider, monthly contribution.
- Cash / savings: NEEDED — the amount (as value) and its currency. OPTIONAL — the institution (as name).
- Bond: NEEDED — its current value (bonds aren't live-priced, so a value is required — units alone won't do). OPTIONAL — coupon rate, maturity date, issuer, ISIN.
- Other: NEEDED — a name and a current value.

If a tool returns needsClarification, ask the user its question naturally and stop — do not guess. Keep answers to a few sentences.`;

export interface AgentChatInput {
  userId: string;
  message: string;
  images: Array<{ base64: string; mediaType: string }>;
  /** PDF broker statements, sent to the model as document blocks. */
  pdfs?: Array<{ base64: string }>;
  /** CSV export(s) already parsed to text on the client, appended to the turn. */
  csvText?: string;
  recentMessages: Array<{ role: string; content: string }>;
  currentAssets: Array<Record<string, unknown>>;
  /** Compact summary of the user's recent recorded actions (adds/edits/removes),
   *  derived from the mutations log. Gives the assistant memory of what it and the
   *  user recently did — the tool calls themselves aren't in the text history. */
  recentActivity?: string;
  displayCurrency: DisplayCurrency;
  used: number;
  /** This user's daily chat allowance (the demo account runs tighter than a
   *  regular user), so the returned `remaining` matches the enforced limit. */
  dailyLimit: number;
  profile: Record<string, unknown>;
  userName?: string;
  fingerprint: string | null;
  isNewUser: boolean;
  /** First-run onboarding: keep the assistant strictly on adding assets (no
   *  scenarios, no general Q&A), so it can't wander out of the guided setup. */
  onboarding?: boolean;
  /** The asset type the user chose to add right now (real_estate | stocks | cash |
   *  crypto | pension | gold | bonds | other), so the scope can name it. */
  onboardingAsset?: string | null;
}

// Asset-type → human label for the onboarding scope block.
const ONBOARDING_ASSET_LABELS: Record<string, string> = {
  real_estate: "a property", stocks: "stocks or funds", etf: "stocks or funds",
  brokerage: "stocks or funds", cash: "cash or savings", crypto: "crypto",
  pension: "a pension", gold: "gold", bonds: "bonds", other: "another asset",
};

// Appended to AGENT_SYSTEM during first-run onboarding so the assistant stays on
// rails: it does portfolio setup only, scoped to the asset the user chose, and
// redirects anything off-topic instead of answering it.
function onboardingScopeBlock(assetType?: string | null): string {
  const label = (assetType && ONBOARDING_ASSET_LABELS[assetType]) || "your assets";
  return `ONBOARDING MODE — STAY ON RAILS (this overrides anything above that would broaden your scope):
The user is in first-run setup, adding their assets one at a time. Right now they are adding: ${label}.
- Do ONLY portfolio setup: help them record assets, nothing else.
- Do NOT run scenarios or projections, do NOT use any what-if/scenario tool, do NOT answer general questions about markets, the economy, companies, or how the app works, and do NOT offer analysis, opinions, or unsolicited commentary.
- Focus on the asset they are adding (${label}): collect everything needed for it — through conversation or a screenshot — then confirm and save it. If they clearly switch to a different asset, help add that one instead.
- If the user asks anything off-topic, reply in ONE short sentence: "Let's finish setting up your portfolio first — I can help with that once you're done." Then keep helping them add assets.
- After an asset is saved, confirm it in one short line and invite them to add another or tap Done. Keep every reply short.`;
}

export interface AgentChatResult {
  message: string;
  scenarioResult?: ScenarioResult | null;
  suggested_replies?: string[] | null;
  assets?: unknown;
  remaining: number;
  analyticsEvent?: string;
  /** The model call itself failed (nothing answered, nothing persisted) — the
   *  route refunds the turn's rate-limit increment. Stripped before the client
   *  response. */
  modelUnavailable?: boolean;
}

function textFrom(content: Anthropic.Messages.ContentBlock[]): string {
  return content.filter((b) => b.type === "text").map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

// A turn can carry more than one commit-bearing tool call (a split import, or a
// commit followed by set_import_acquisition_date). Merge their outcomes instead
// of keeping only the last: a trailing all-duplicates batch (`changed: false`)
// must not erase the successful batch's snapshot/backfill/market-context work.
function mergeCommits(a: CommitOutcome | null, b: CommitOutcome): CommitOutcome {
  if (!a) return b;
  return {
    changed: a.changed || b.changed,
    mutationMetas: [...a.mutationMetas, ...b.mutationMetas],
    analyticsEvent: a.analyticsEvent ?? b.analyticsEvent,
    needsBackfill: a.needsBackfill || b.needsBackfill,
    hasAdds: a.hasAdds || b.hasAdds,
    rebuildFrom:
      a.rebuildFrom == null ? b.rebuildFrom
      : b.rebuildFrom == null ? a.rebuildFrom
      : a.rebuildFrom < b.rebuildFrom ? a.rebuildFrom : b.rebuildFrom,
  };
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
  // The Messages API requires the FIRST message to be role "user" (consecutive
  // same-role turns merge fine). A tag-era assistant row can strip to empty and
  // drop out above, shifting the window off pair alignment so it starts with an
  // assistant turn — which would 400 EVERY request for that user, and since a
  // failed turn is never persisted the window never advances: chat stays dead.
  while (history.length > 0 && history[0].role !== "user") history.shift();

  const userContent: Anthropic.Messages.ContentBlockParam[] = [];
  for (const img of input.images) {
    userContent.push({ type: "image", source: { type: "base64", media_type: img.mediaType as "image/png", data: img.base64 } });
  }
  // PDF broker statements → document blocks (the model extracts the text/tables).
  for (const pdf of input.pdfs ?? []) {
    userContent.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.base64 } });
  }
  // Working memory of what was recently recorded. The model's own tool calls are
  // stripped from the text history it sees next turn, so without this it can't tell
  // what it just did (the "already dated, nothing to do" hallucination). This is
  // read-only context derived from the saved mutations — reference, don't re-apply.
  if (input.recentActivity) {
    userContent.push({
      type: "text",
      text: `[Recent portfolio activity already on record (most recent first) — these are already saved; reference them naturally and do NOT re-add or re-record them:\n${input.recentActivity}]`,
    });
  }
  const csvText = input.csvText ?? "";
  const hasImportFile = input.images.length > 0 || (input.pdfs?.length ?? 0) > 0 || csvText.length > 0;
  const baseText = input.message
    || (hasImportFile ? "Extract all positions from the attached file(s) and add them to my portfolio." : "");
  userContent.push({ type: "text", text: csvText ? `${baseText}\n\nImported table(s):\n${csvText}` : baseText });

  const messages: Anthropic.Messages.MessageParam[] = [...history, { role: "user", content: userContent }];

  // Figures already visible in this conversation are fair game to reference
  // again: an assistant turn passed this same guardrail when it was produced,
  // and a number the user typed is their own data. Without these, any follow-up
  // that echoed the previous answer ("…of your €365.448 net worth") was treated
  // as fabrication and the whole reply discarded — a curt one-liner right after
  // a perfectly good answer. Fabrication remains a number appearing from
  // NOWHERE: not from a tool this turn, not on screen, not typed by the user.
  const conversationFigures = [
    ...extractMonetaryNumbers(csvText ? `${baseText}\n${csvText}` : baseText),
    ...history.flatMap((h) => (typeof h.content === "string" ? extractMonetaryNumbers(h.content) : [])),
  ];
  // Shorthand amounts the user typed ("€5k", "$1.2m") expand to the full figure
  // the model will echo back ("€5,000") — the raw extraction only captures the
  // "€5" prefix of the shorthand, so without this the legitimate echo reads as
  // a fabricated number and the reply is discarded.
  const SHORTHAND_AMOUNT = /[€$£]\s?\d+(?:[.,]\d+)?\s?[km]\b/gi;
  for (const src of [baseText, ...history.map((h) => (typeof h.content === "string" ? h.content : ""))]) {
    for (const match of src.match(SHORTHAND_AMOUNT) ?? []) {
      const numPart = parseFloat(match.slice(1).replace(",", "."));
      const mult = /m\b/i.test(match) ? 1_000_000 : 1_000;
      if (Number.isFinite(numPart)) conversationFigures.push(`${match[0]}${Math.round(numPart * mult)}`);
    }
  }

  // During first-run onboarding, append the scope block so the assistant does asset
  // setup only (no scenarios / general Q&A) and stays on the chosen asset. Normal
  // chat is untouched, so its cached system prefix is unchanged.
  const systemPrompt = input.onboarding
    ? `${AGENT_SYSTEM}\n\n${onboardingScopeBlock(input.onboardingAsset)}`
    : AGENT_SYSTEM;

  // Accumulated across tool round-trips.
  const figures: string[] = [];
  let card: ScenarioResult | null = null;
  let chips: string[] | null = null;
  let commit: CommitOutcome | null = null;
  let finalText = "";
  // Last successful portfolio-read result, kept so a discarded/empty narration
  // can fall back to rendering the verified figures instead of a dead line.
  let lastRead: { tool: string; data: Record<string, unknown> } | null = null;
  // True when the loop exhausted its round budget while the model still wanted
  // tools — the turn is unfinished, not failed, and the reply must say so.
  let stoppedAtRoundtripCap = true;

  for (let round = 0; round < AGENT_MAX_TOOL_ROUNDTRIPS; round++) {
    let resp: Anthropic.Messages.Message;
    try {
      // Top-level cache_control marks the last cacheable block, so each tool
      // round-trip (and each follow-up turn) reads the tools+system+history
      // prefix from cache instead of re-paying full input price for it.
      // 8000: a screenshot-import commit_mutation call carries a large positions
      // array as its tool input; if the response hits the cap mid-JSON the tool
      // input truncates and the whole batch is silently discarded (this bit us at
      // 1500). A big import (20+ rows, all fields) can approach 4000, so give it
      // headroom. Final-text rounds stay far under this — max_tokens is a ceiling,
      // not a target, so quiet rounds cost nothing extra.
      resp = await anthropic.messages.create({ model: MODEL, max_tokens: 8000, system: systemPrompt, tools: AGENT_TOOLS, messages, cache_control: { type: "ephemeral" } });
    } catch (err) {
      Sentry.captureException(err, { tags: { route: "agent-chat" } });
      // modelUnavailable → the route refunds this turn's rate-limit increment:
      // the user got no answer, so the turn shouldn't spend allowance (on the
      // demo's 20-message budget an upstream outage would otherwise burn the
      // whole trial in error bubbles).
      return { message: "Couldn't reach the assistant. Please try again.", remaining: input.dailyLimit - input.used, modelUnavailable: true };
    }

    messages.push({ role: "assistant", content: resp.content });
    // A truncated response can cut a tool_use's JSON input mid-stream, silently
    // dropping (e.g.) a whole commit_mutation batch. Rare now the cap is 8000, but
    // flag it so it's diagnosable rather than an invisible "nothing committed".
    if (resp.stop_reason === "max_tokens") {
      Sentry.captureMessage("agent response hit max_tokens — a tool call may be truncated", "warning");
    }
    const toolUses = resp.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) {
      finalText = textFrom(resp.content);
      stoppedAtRoundtripCap = false;
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
      if (READ_TOOLS.has(tu.name) && outcome.forModel && typeof outcome.forModel === "object" && !("error" in (outcome.forModel as Record<string, unknown>))) {
        lastRead = { tool: tu.name, data: outcome.forModel as Record<string, unknown> };
      }
      if (outcome.card) card = outcome.card;
      if (outcome.proposal) chips = outcome.proposal.chips;
      if (outcome.commit) commit = mergeCommits(commit, outcome.commit);
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(outcome.forModel) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  // Round budget exhausted mid-task: hand off explicitly instead of failing
  // silently — any work already done (including a commit) is saved, and the next
  // turn resumes with the thread and recent-activity context intact.
  // Verified-figure fallback: deterministic lines rendered straight from the
  // last read tool's own result, so a missing or discarded narration still
  // answers with real numbers instead of a dead "Here's what I found."
  const verifiedLines = lastRead ? figureLines(lastRead.tool, lastRead.data) : "";
  if (stoppedAtRoundtripCap) {
    finalText = "That needed more steps than one reply allows, so I paused partway. Say \"continue\" and I'll pick up where I left off.";
  } else if (!finalText) {
    finalText = verifiedLines ? `Here's what I found.\n${verifiedLines}` : "Here's what I found.";
  }

  // Numeric guardrail, defense-in-depth: if the prose asserts a MONEY/percent
  // figure no tool returned, drop the prose (the card, if any, carries the
  // deterministic truth). Only money/percent tokens are checked — bare counts,
  // years and ordinals ("18 positions", "2 years ago") are legitimate prose and
  // used to trip this on ordinary commit/import turns, replacing a good reply
  // with a confusing "rephrase the question?" right after the user had answered.
  // Without a card there's nothing to fall back to, so use a neutral line, never
  // an interrogative that reads as a non-sequitur.
  // Percent figures are matched with tolerance (rounded integer / comma-decimal
  // twins) — a legitimate "62.5% → 63%" rewrite must not erase the reply; money
  // amounts still have to match a tool figure verbatim. The Sentry event carries
  // the offending tokens, so a trip is diagnosable instead of a bare warning.
  // Armed whenever verified figures exist OR the turn wrote: a commit narration
  // that invents a self-summed total (e.g. from screenshot pixels) must degrade
  // to the neutral line, not ship a fabricated bold figure — commit results
  // carry no figures, so the old figures-only gate skipped exactly those turns.
  // Pure conversational turns stay ungated: generic prose ("no single position
  // above 10%") carries rhetorical numbers no allowlist could anticipate.
  const offending = figures.length > 0 || commit
    ? offendingMonetaryTokens(finalText, withPercentTolerance([...figures, ...conversationFigures]))
    : [];
  if (offending.length > 0) {
    Sentry.captureMessage("agent narration failed numeric guardrail", { level: "warning", extra: { offending } });
    finalText = card
      ? "Here are the figures from the calculation:"
      : verifiedLines
        ? `Here's what the numbers say — exactly as calculated:\n${verifiedLines}`
        : "Here's what I found.";
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
          // Each meta's market context is an independent external lookup, so run
          // them with bounded concurrency instead of one-at-a-time — a multi-asset
          // add no longer serializes N sequential fetches. Per-item errors are
          // swallowed so one bad symbol can't drop the rest.
          await mapWithConcurrency(commit.mutationMetas, 5, async (meta) => {
            try {
              const c = await generateMarketContext(meta.symbol, meta.occurredAt, meta.assetType);
              if (c) await sb.from("mutations").update({ market_context: c }).eq("id", meta.id);
            } catch (err) { Sentry.captureException(err, { tags: { background: "agent-market-context-item" } }); }
          });
        } catch (err) { Sentry.captureException(err, { tags: { background: "agent-market-context" } }); }
      });
    }
    after(async () => { try { await writeSnapshot(input.userId); } catch (err) { Sentry.captureException(err, { tags: { background: "agent-snapshot" } }); } });
    if (commit.needsBackfill) after(async () => { try { await backfillSnapshots(input.userId, commit.rebuildFrom); } catch (err) { Sentry.captureException(err, { tags: { background: "agent-backfill" } }); } });
    // Holdings changed → recompute the user's market-swing entries in the background.
    after(() => generateMarketSwings(input.userId));
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
  // A failed insert silently loses the turn from history (the reply still
  // returns live) — capture it so history gaps are diagnosable.
  const { error: persistError } = await supabase.from("messages").insert(
    timestampedPair(
      { user_id: input.userId, role: "user", content: input.message || (hasImportFile ? "[file uploaded]" : "[screenshot uploaded]") },
      { user_id: input.userId, role: "assistant", content: finalText, suggested_replies: chips, tool_result: card ?? null },
    ),
  );
  if (persistError) Sentry.captureException(persistError, { tags: { route: "agent-chat", step: "persist-turn" } });

  return {
    message: finalText,
    scenarioResult: card,
    suggested_replies: chips,
    assets: updatedAssets,
    remaining: input.dailyLimit - input.used,
    // A past-dated add triggers a background history rebuild (backfillSnapshots),
    // which is what makes the net-worth chart lag the reply. Signal it so the
    // client shows a "building" indicator and auto-refreshes when it lands.
    ...(commit?.needsBackfill ? { building: true } : {}),
    ...(analyticsEvent ? { analyticsEvent } : {}),
  };
}
