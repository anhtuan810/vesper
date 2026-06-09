import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { buildStaticSystem, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { isSupportedCurrency, formatMoney, setUsdRate, type DisplayCurrency } from "@/lib/money";
import { toUsd, getUsdRates } from "@/lib/fx";
import { fetchHistoricalPrice } from "@/lib/prices";
import { priceHoldingsLive } from "@/lib/prices-server";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { validateEnv } from "@/lib/env";
import { applyPortfolioChanges, ValueModeError } from "@/lib/apply-changes";
import { generateMarketContext } from "@/lib/market-context";
import { generateInsight } from "@/lib/insight-generator";
import { validatePortfolioChanges } from "@/lib/validations";
import { geocodeAddress, compareEnteredAddress } from "@/lib/geocode";
import { venueChipsFor } from "@/lib/venues";
import { CHAT_DAILY_LIMIT } from "@/lib/constants";
import {
  ALLOWED_IMAGE_TYPES, CONFIRMATION_CHIPS,
  sanitizeChips, stripTags, extractTag, timestampedPair,
} from "@/lib/chat-helpers";
import { resolveProposal } from "@/lib/proposal-resolver";
import { PENSION_ECHO_CHIPS } from "@/lib/pension-intake";
import { extractNumbers, validateNarration } from "@/lib/narrate/guardrail";
import { narrateScenario } from "@/lib/scenario/narrate";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import { assembleProject } from "@/lib/scenario/project-assemble";
import { resolveHeldAsset, type AssetRef } from "@/lib/scenario/resolve-asset";
import { resolveMarketSymbol } from "@/lib/scenario/resolve-market-symbol";
import { validateScenarioIntent } from "@/lib/scenario/validate-intent";
import { computePortfolioChange } from "@/lib/scenario/portfolio-readout";
import { isAgentChatEnabled } from "@/lib/chat/agent-config";
import { runAgentChat } from "@/lib/chat/agent-loop";
import type { Modification } from "@/lib/scenario/engine";
import type { Asset } from "@/lib/supabase";
import type { ScenarioResult, ScenarioVitalDelta } from "@/lib/scenario/result";

validateEnv();

const anthropic = new Anthropic();

// Compute and render the result card directly, or (free-typed) confirm first.
type ScenarioMode = "compute" | "confirm";
const SCENARIO_SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£" };
const SHOW_ME_CHIPS = ["Show me", "Change it"];

// Scenario → chat narration handoff. Narrates already-computed figures under the
// numeric guardrail (Claude produces no numbers of its own) and writes the turn.
// Self-contained: shares auth + rate limit but never enters the mutation/proposal
// flow. No portfolio mutation occurs.
async function handleScenarioNarration(userId: string, raw: unknown): Promise<NextResponse> {
  const h = raw as Partial<ScenarioHandoff>;
  if (
    !h ||
    typeof h.userMessage !== "string" ||
    typeof h.description !== "string" ||
    typeof h.fallback !== "string" ||
    !Array.isArray(h.figures)
  ) {
    return NextResponse.json({ message: "Invalid scenario handoff." }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const today = new Date().toISOString().slice(0, 10);
  const { data: newCount, error: rpcError } = await supabase.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_bucket: "chat",
    p_date: today,
  });
  if (rpcError || newCount == null) {
    return NextResponse.json({ message: "Couldn't reach the assistant. Please try again." }, { status: 500 });
  }
  if ((newCount as number) > CHAT_DAILY_LIMIT) {
    return NextResponse.json(
      { message: `You've reached today's message limit (${CHAT_DAILY_LIMIT}). Come back tomorrow!`, assets: null, remaining: 0 },
      { status: 429 },
    );
  }
  const used = (newCount as number) - 1;

  const { narration } = await narrateScenario(h as ScenarioHandoff);

  await supabase.from("messages").insert(
    timestampedPair(
      { user_id: userId, role: "user", content: h.userMessage },
      { user_id: userId, role: "assistant", content: narration },
    ),
  );

  return NextResponse.json({ message: narration, assets: null, suggested_replies: null, remaining: CHAT_DAILY_LIMIT - used });
}

// Persist the user + assistant pair and return the chat response shape. `extra`
// can carry a scenarioResult card, a scenarioPending intent, or suggested_replies.
async function scenarioReply(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMessage: string,
  content: string,
  used: number,
  extra?: Record<string, unknown>,
): Promise<NextResponse> {
  await supabase.from("messages").insert(
    timestampedPair(
      { user_id: userId, role: "user", content: userMessage },
      { user_id: userId, role: "assistant", content },
    ),
  );
  return NextResponse.json({
    message: content,
    assets: null,
    suggested_replies: null,
    remaining: CHAT_DAILY_LIMIT - used,
    ...extra,
  });
}

// Chat-initiated FUTURE scenario: run the shared project assembly (rate derived
// from snapshots) and narrate the headline figures, plus a pointer to Project
// mode for the chart. Read-only — writes only the message pair.
async function handleFutureScenario(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMessage: string,
  parsed: Record<string, unknown>,
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse> {
  const reply = (content: string, extra?: Record<string, unknown>) =>
    scenarioReply(supabase, userId, userMessage, content, used, extra);

  // Free-typed: confirm before computing.
  if (mode === "confirm") {
    let interpretation: string;
    if (parsed.mode === "solve") {
      interpretation = "Work out the contribution you'd need to hit that target?";
    } else if (parsed.contribution && typeof parsed.contribution === "object") {
      interpretation = "Project where you're heading with that contribution?";
    } else {
      const h = typeof parsed.horizonYears === "number" ? Math.round(parsed.horizonYears) : 10;
      interpretation = `Project where you're heading over the next ${h} years?`;
    }
    return reply(interpretation, { suggested_replies: SHOW_ME_CHIPS, scenarioPending: parsed });
  }

  const usdRates = await getUsdRates();
  const dispRate = usdRates[displayCurrency];
  if (displayCurrency !== "USD" && dispRate) setUsdRate(displayCurrency, dispRate);
  const toUsdAmt = (displayAmt: number): number =>
    displayCurrency === "USD" ? displayAmt : displayAmt / (usdRates[displayCurrency] ?? 1);

  const body: Record<string, unknown> = { mode: parsed.mode };
  if (parsed.mode === "trajectory") {
    if (parsed.contribution && typeof parsed.contribution === "object") {
      const cobj = parsed.contribution as Record<string, unknown>;
      const amountDisplay = Number(cobj.amount);
      if (Number.isFinite(amountDisplay) && amountDisplay > 0) {
        body.contribution = { amount: toUsdAmt(amountDisplay), frequency: cobj.frequency === "yearly" ? "annual" : "monthly" };
      }
    }
    if (typeof parsed.horizonYears === "number") body.horizonYears = parsed.horizonYears;
  } else {
    if (typeof parsed.target === "number") body.targetUsd = toUsdAmt(parsed.target);
    if (typeof parsed.targetYear === "number") body.date = `${parsed.targetYear}-12-31`;
    if (typeof parsed.frequency === "string") body.frequency = parsed.frequency === "yearly" ? "annual" : "monthly";
  }

  const result = await assembleProject(supabase, userId, body);
  if ("error" in result) {
    return reply("I couldn't run that projection — could you give a time horizon (and a target if you're solving for a contribution)?");
  }

  const m = (usd: number) => formatMoney(usd, "USD", displayCurrency);
  const toDisp = (usd: number) => usd * (dispRate ?? 1);
  if (result.mode === "trajectory") {
    const low = m(result.trajectory.low), mid = m(result.trajectory.mid), high = m(result.trajectory.high);
    const rateStr = `${(result.rate * 100).toFixed(1)}%`;
    const horizonStr = `${Math.round(result.horizonYears)}`;
    const figures = [low, mid, high, rateStr, horizonStr];
    const description = `Forward projection over ${horizonStr} years at a derived ${rateStr} nominal rate. Net worth midpoint ${mid}, range ${low} to ${high}.`;
    const fallback = `Over ${horizonStr} years at ${rateStr}, your net worth projects to ${mid} at the midpoint, ranging from ${low} to ${high}.`;

    // Build the cone (history from snapshots + projected band) in display numbers.
    const { data: snapRows } = await supabase
      .from("snapshots")
      .select("date, total_value")
      .eq("user_id", userId)
      .order("date", { ascending: true });
    const now = new Date();
    const horizonDate = new Date(now);
    horizonDate.setFullYear(now.getFullYear() + Math.round(result.horizonYears));
    const scenarioResult: ScenarioResult = {
      kind: "future",
      cone: {
        history: (snapRows ?? []).map((s) => ({ t: Date.parse(s.date as string), v: toDisp(Number(s.total_value)) })),
        today: { t: now.getTime(), v: toDisp(result.startUsd) },
        horizon: {
          t: horizonDate.getTime(),
          low: toDisp(result.trajectory.low),
          mid: toDisp(result.trajectory.mid),
          high: toDisp(result.trajectory.high),
        },
        horizonYear: horizonDate.getFullYear(),
        symbol: SCENARIO_SYMBOL[displayCurrency] ?? "€",
      },
    };

    const { narration } = await narrateScenario({ userMessage, description, figures, fallback });
    return reply(narration, { scenarioResult });
  }

  if (result.mode !== "solve") {
    return reply("I couldn't run that projection — could you give a target and a year?");
  }

  const amt = m(result.solve.amountPerPeriod);
  const target = m(result.targetUsd);
  const per = result.solve.frequency === "annual" ? "per year" : "per month";
  const year = result.date.slice(0, 4);
  const figures = [amt, target, year];
  const description = `Solve-for: to reach ${target} by ${year}, the required contribution is ${amt} ${per}.`;
  const fallback = `To reach ${target} by ${year}, you'd need to contribute ${amt} ${per}.`;
  const { narration } = await narrateScenario({ userMessage, description, figures, fallback });
  return reply(narration);
}

const fmtScenarioPct = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + "%";

// Asset types per shock category (mirrors the allocation/drawdown groupings).
const SHOCK_TYPES: Record<string, string[]> = {
  markets: ["stocks", "etf", "gold"], market: ["stocks", "etf", "gold"], equities: ["stocks", "etf", "gold"], stocks: ["stocks", "etf", "gold"],
  crypto: ["crypto"],
  property: ["real_estate"], housing: ["real_estate"], real_estate: ["real_estate"],
  reserves: ["cash", "pension", "bonds"], cash: ["cash"],
  all: ["stocks", "etf", "gold", "crypto", "real_estate"], everything: ["stocks", "etf", "gold", "crypto", "real_estate"],
};
const categoryFromSymbol = (symbol: string): string => (symbol.endsWith("-USD") ? "crypto" : "stocks");

// Translate the classifier's portfolio_change modifications into engine
// Modifications against the real (full) asset rows. A buy resolves to "add at
// today's price" (units × today's close) — never a growth curve. Fetches a live
// price only when a unit quantity has no price to anchor to.
async function buildPortfolioMods(
  modifications: unknown[],
  assets: Array<Record<string, unknown>>,
  displayCurrency: DisplayCurrency,
  usdRates: Record<string, number>,
): Promise<{ mods: Modification[] } | { error: string }> {
  const refs: AssetRef[] = assets.map((a) => ({ id: String(a.id), name: String(a.name), type: String(a.type), symbol: (a.symbol as string | null) ?? null }));
  const byId = new Map(assets.map((a) => [String(a.id), a]));
  const toNative = (displayAmt: number, cur: string): number => {
    const usd = displayCurrency === "USD" ? displayAmt : displayAmt / (usdRates[displayCurrency] ?? 1);
    return cur === "USD" ? usd : usd * (usdRates[cur] ?? 1);
  };
  const curToNative = (amt: number, fromCur: string, toCur: string): number => {
    const usd = fromCur === "USD" ? amt : amt / (usdRates[fromCur] ?? 1);
    return toCur === "USD" ? usd : usd * (usdRates[toCur] ?? 1);
  };

  const mods: Modification[] = [];
  for (const raw of modifications) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const action = o.action;
    const units = typeof o.units === "number" && o.units > 0 ? o.units : null;
    const amount = typeof o.amount === "number" && o.amount > 0 ? o.amount : null;
    const amtCur = isSupportedCurrency(o.currency) ? (o.currency as string) : displayCurrency;

    if (action === "shock") {
      const cat = String(o.asset ?? "").toLowerCase();
      const pct = typeof o.pct === "number" ? o.pct : 0;
      const types = new Set(SHOCK_TYPES[cat] ?? []);
      const factor = Math.max(0, 1 - pct / 100);
      for (const a of assets) {
        if (types.has(String(a.type))) mods.push({ kind: "setValue", assetId: String(a.id), nativeValue: Number(a.value) * factor });
      }
      continue;
    }

    if (action === "pay_mortgage") {
      if (amount == null) continue;
      const property = assets.find((a) => a.type === "real_estate" && Number(a.mortgage_balance ?? 0) > 0);
      if (!property) return { error: "There's no mortgage on file to pay down." };
      mods.push({ kind: "payDownMortgage", assetId: String(property.id), amount: toNative(amount, String(property.currency || "USD")) });
      const cash = assets.filter((a) => a.type === "cash" || a.type === "pension").sort((x, y) => Number(y.value) - Number(x.value))[0];
      if (cash) mods.push({ kind: "setValue", assetId: String(cash.id), nativeValue: Math.max(0, Number(cash.value) - toNative(amount, String(cash.currency || "USD"))) });
      continue;
    }

    const assetQ = typeof o.asset === "string" ? o.asset : null;
    if (!assetQ) continue;
    const held = resolveHeldAsset(refs, assetQ);

    if (action === "buy") {
      if (held.kind === "resolved") {
        // Top up an existing holding.
        const full = byId.get(held.asset.id)!;
        const cur = String(full.currency || "USD");
        let deltaNative: number;
        if (amount != null) deltaNative = curToNative(amount, amtCur, cur);
        else {
          const heldUnits = Number(full.units ?? 0);
          if (units != null && heldUnits > 0) deltaNative = units * (Number(full.value) / heldUnits);
          else if (units != null && full.symbol) { const px = await priceNative(String(full.symbol)); deltaNative = px ? curToNative(units * px.price, px.currency, cur) : 0; }
          else deltaNative = toNative(10_000, cur);
        }
        if (deltaNative > 0) mods.push({ kind: "setValue", assetId: held.asset.id, nativeValue: Number(full.value) + deltaNative });
      } else {
        // A new position, valued at today's price.
        const mk = await resolveMarketSymbol(assetQ);
        if (mk.kind !== "resolved") return { error: `I couldn't find "${assetQ}". Which asset did you mean?` };
        const type = categoryFromSymbol(mk.symbol);
        if (amount != null) {
          mods.push({ kind: "addByValue", name: mk.label, type, currency: amtCur, nativeValue: amount });
        } else if (units != null) {
          const px = await priceNative(mk.symbol);
          if (!px) return { error: `I couldn't pull a current price for ${mk.label}.` };
          mods.push({ kind: "addByValue", name: mk.label, type, currency: px.currency, nativeValue: units * px.price });
        } else {
          mods.push({ kind: "addByValue", name: mk.label, type, currency: displayCurrency, nativeValue: 10_000 });
        }
      }
      continue;
    }

    // sell / set / remove — held only (gate enforced).
    if (held.kind !== "resolved") continue;
    const full = byId.get(held.asset.id)!;
    const cur = String(full.currency || "USD");
    if (action === "remove") mods.push({ kind: "remove", assetId: held.asset.id });
    else if (action === "set") { const v = typeof o.value === "number" ? o.value : null; if (v != null && v >= 0) mods.push({ kind: "setValue", assetId: held.asset.id, nativeValue: toNative(v, cur) }); }
    else if (action === "sell" || action === "reduce") {
      let deltaNative: number | null = null;
      if (amount != null) deltaNative = curToNative(amount, amtCur, cur);
      else if (units != null) { const heldUnits = Number(full.units ?? 0); deltaNative = heldUnits > 0 ? units * (Number(full.value) / heldUnits) : null; }
      if (deltaNative != null) mods.push({ kind: "setValue", assetId: held.asset.id, nativeValue: Math.max(0, Number(full.value) - deltaNative) });
    }
  }
  return { mods };
}

// Today's close in native currency for a symbol (range=5d), best-effort.
async function priceNative(symbol: string): Promise<{ price: number; currency: string } | null> {
  const p = await fetchHistoricalPrice(symbol, null);
  return p ? { price: p.price, currency: p.currency } : null;
}

// Chat-initiated PORTFOLIO CHANGE — any buy/sell/shock/hypothetical-buy resolves to a
// modified portfolio and returns ONE answer: the whole portfolio before -> after
// (net worth, distribution, concentration, and the few vitals the move changes).
// Read-only — writes only the message pair.
async function handlePortfolioChange(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMessage: string,
  parsed: Record<string, unknown>,
  assets: Array<Record<string, unknown>>,
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse> {
  const reply = (content: string, extra?: Record<string, unknown>) =>
    scenarioReply(supabase, userId, userMessage, content, used, extra);

  // Free-typed: confirm before computing.
  if (mode === "confirm") {
    return reply("Show your portfolio before and after that change?", {
      suggested_replies: SHOW_ME_CHIPS,
      scenarioPending: parsed,
    });
  }

  const modifications = Array.isArray(parsed.modifications) ? parsed.modifications : [];
  const usdRates = await getUsdRates();
  if (displayCurrency !== "USD" && usdRates[displayCurrency]) setUsdRate(displayCurrency, usdRates[displayCurrency]);

  // Baseline = the SAME live, freshly-priced holdings the dashboard shows (stored
  // values can be stale after a price move). Modifications apply on top of "now".
  const live = await priceHoldingsLive(assets as Array<Record<string, unknown> & { symbol?: string | null; units?: number | null; value: number; currency: string; country?: string | null }>);

  const built = await buildPortfolioMods(modifications, live, displayCurrency, usdRates);
  if ("error" in built) return reply(built.error);
  if (built.mods.length === 0) return reply("I couldn't read that change — which positions should move, and by how much?");

  const { data: urow } = await supabase.from("users").select("country").eq("id", userId).maybeSingle();
  const readout = computePortfolioChange(live as unknown as Asset[], built.mods, usdRates, { country: urow?.country ?? null });

  const m = (usd: number) => formatMoney(usd, "USD", displayCurrency);
  const c = readout.current, s = readout.scenario;
  const nwAfter = m(s.netWorthUsd), nwBefore = m(c.netWorthUsd);
  const nwDelta = s.netWorthUsd - c.netWorthUsd;
  const deltaStr = m(Math.abs(nwDelta));
  const sign = nwDelta >= 0 ? "+" : "−";
  const conBefore = fmtScenarioPct(c.topSingleNameConcentrationPct), conAfter = fmtScenarioPct(s.topSingleNameConcentrationPct);

  const vitals: ScenarioVitalDelta[] = readout.contextualVitals.map((v) => ({
    key: v.key, label: v.label, before: fmtScenarioPct(v.before), after: fmtScenarioPct(v.after),
    beforeBand: v.beforeBand, afterBand: v.afterBand, higherIsWorse: v.higherIsWorse,
  }));

  const figures = [nwAfter, nwBefore, deltaStr, conBefore, conAfter, ...vitals.flatMap((v) => [v.before, v.after])];
  const vitalSentence = vitals.length
    ? " It also moves " + vitals.map((v) => `${v.label.toLowerCase()} from ${v.before} to ${v.after}`).join(" and ") + "."
    : "";
  const description =
    `Whole-portfolio before -> after. Net worth moves to ${nwAfter} (${sign}${deltaStr} versus ${nwBefore} now). ` +
    `Single-name concentration goes from ${conBefore} to ${conAfter}.${vitalSentence} ` +
    `Stay portfolio-level — the focus is the whole portfolio, not any single position.`;
  const fallback =
    `This moves your net worth to ${nwAfter} (${sign}${deltaStr}), with single-name concentration ${conBefore} → ${conAfter}.${vitalSentence}`;

  const scenarioResult: ScenarioResult = {
    kind: "portfolio_change",
    current: c,
    scenario: s,
    displayCurrency,
    contextualVitals: vitals,
  };
  const { narration } = await narrateScenario({ userMessage, description, figures, fallback });
  return reply(narration, { scenarioResult });
}

// Route a parsed scenario intent to the matching handler. Returns null when the
// intent isn't a recognised scenario (so the caller falls through to normal flow).
async function dispatchScenario(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMsg: string,
  rawIntent: Record<string, unknown>,
  assets: unknown[],
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse | null> {
  // Recognised scenario kinds run through the deterministic gate first: it
  // normalizes parameters and asks (via the existing chip mechanism) on anything
  // implausible or missing, so we never compute a confident wrong answer.
  const KNOWN = new Set(["portfolio_change", "future"]);
  if (!KNOWN.has(rawIntent.kind as string)) return null;

  const assetRefs: AssetRef[] = (assets as Array<Record<string, unknown>>).map((a) => ({
    id: String(a.id),
    name: String(a.name),
    type: String(a.type),
    symbol: (a.symbol as string | null) ?? null,
  }));
  const usdRates = await getUsdRates();
  const gate = await validateScenarioIntent(rawIntent, assetRefs, { displayCurrency, usdRates });
  if ("clarify" in gate) {
    const { question, options } = gate.clarify;
    return scenarioReply(supabase, userId, userMsg, question, used, options.length >= 2 ? { suggested_replies: options } : undefined);
  }
  const parsed = gate.ok;

  if (parsed.kind === "portfolio_change") {
    return handlePortfolioChange(supabase, userId, userMsg, parsed, assets as Array<Record<string, unknown>>, displayCurrency, used, mode);
  }
  if (parsed.kind === "future" && (parsed.mode === "trajectory" || parsed.mode === "solve")) {
    return handleFutureScenario(supabase, userId, userMsg, parsed, displayCurrency, used, mode);
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const userId = user.id;

    const { message, images: rawImages, scenarioHandoff, scenarioConfirm, fromChip } = await req.json();

    // Scenario-narration handoff — handled before the message/mutation flow.
    if (scenarioHandoff) {
      return await handleScenarioNarration(userId, scenarioHandoff);
    }

    // Normalise: accept array (new) or single object (old clients)
    const images: Array<{ base64: string; mediaType: string }> = Array.isArray(rawImages)
      ? rawImages
      : rawImages ? [rawImages] : [];

    if (!message && images.length === 0) {
      return NextResponse.json({ message: "No message provided" }, { status: 400 });
    }

    if (message && message.length > 500) {
      return NextResponse.json({ message: "Message is too long — keep it under 500 characters." }, { status: 400 });
    }

    for (const img of images) {
      // ~7 MB base64 ≈ 5 MB binary — matches the client-side paste limit
      if (img.base64.length > 7_000_000) {
        return NextResponse.json({ message: "One of the screenshots is too large — keep each under 5 MB." }, { status: 400 });
      }
      if (!ALLOWED_IMAGE_TYPES.has(img.mediaType)) {
        return NextResponse.json({ message: "That image format isn't supported. Try PNG, JPG, GIF, or WebP." }, { status: 400 });
      }
    }

    const supabase = createServerSupabase();

    const today = new Date().toISOString().slice(0, 10);

    const { data: newCount, error: rpcError } = await supabase.rpc("increment_rate_limit", {
      p_user_id: userId,
      p_bucket: "chat",
      p_date: today,
    });

    if (rpcError || newCount == null) {
      return NextResponse.json({ message: "Couldn't reach the assistant. Please try again." }, { status: 500 });
    }

    if ((newCount as number) > CHAT_DAILY_LIMIT) {
      return NextResponse.json({
        message: `You've reached today's message limit (${CHAT_DAILY_LIMIT}). Come back tomorrow!`,
        assets: null,
        remaining: 0,
      }, { status: 429 });
    }

    const used = (newCount as number) - 1;

    // --- Load user context ---
    const [
      { data: assets },
      { data: recentMessages },
      { data: userData },
      { data: recentMutations },
    ] = await Promise.all([
      supabase.from("assets").select("*").eq("user_id", userId),
      supabase
        .from("messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("users").select("profile, name, display_currency, fingerprint").eq("id", userId).single(),
      supabase
        .from("mutations")
        .select("*")
        .eq("user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(10),
    ]);

    const currentAssets = assets || [];
    const profile = userData?.profile || {};
    const userName = userData?.name || undefined;
    const displayCurrency: DisplayCurrency = isSupportedCurrency(userData?.display_currency)
      ? (userData!.display_currency as DisplayCurrency)
      : "USD";
    const isNewUser = currentAssets.length === 0;

    // --- Agent tool-calling loop (flag-gated; OFF by default) ---
    // When enabled, Claude reasons over the thread and calls deterministic tools
    // for every figure and write, replacing the tag-emission flow below.
    if (isAgentChatEnabled()) {
      const result = await runAgentChat({
        userId,
        message: message ?? "",
        images,
        recentMessages: (recentMessages ?? []).slice(0, 6).reverse().map((mm) => ({ role: mm.role, content: mm.content })),
        currentAssets: currentAssets as Array<Record<string, unknown>>,
        displayCurrency,
        used,
        profile: profile as Record<string, unknown>,
        userName,
        fingerprint: userData?.fingerprint ?? null,
        isNewUser,
      });
      return NextResponse.json(result);
    }

    // --- Confirmed scenario ([Show me] on a free-typed intent) ---
    // Compute and render directly, skipping Claude classification entirely.
    if (scenarioConfirm && typeof scenarioConfirm === "object") {
      const userMsg = typeof message === "string" && message.trim() ? message : "Scenario";
      const res = await dispatchScenario(
        supabase, userId, userMsg, scenarioConfirm as Record<string, unknown>,
        currentAssets, displayCurrency, used, "compute",
      );
      if (res) return res;
    }

    // --- Build system prompt ---
    const usdRates = isNewUser ? undefined : await getUsdRates();
    const systemBlocks: Anthropic.Messages.TextBlockParam[] = isNewUser
      ? [{ type: "text", text: buildOnboardingPrompt(displayCurrency), cache_control: { type: "ephemeral" } }]
      : [
          { type: "text", text: buildStaticSystem(displayCurrency), cache_control: { type: "ephemeral" } },
          { type: "text", text: buildDynamicContext(currentAssets, profile, recentMutations || [], displayCurrency, userName, usdRates) },
        ];

    // --- Build conversation history (last 6 messages) ---
    const history = (recentMessages || [])
      .slice(0, 6)
      .reverse()
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: stripTags(m.content),
      }))
      .filter((m) => m.content.length > 0);

    // --- Build current message (with optional images) ---
    const userContent: Anthropic.Messages.ContentBlockParam[] = [];

    for (const img of images) {
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: (img.mediaType || "image/png") as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
          data: img.base64,
        },
      });
    }

    userContent.push({
      type: "text",
      text: message || "Extract all positions from this screenshot and add them to my portfolio.",
    });

    // --- Call Claude (with retry) ---
    let response: Anthropic.Messages.Message | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        response = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          // A multi-row screenshot import can produce a large <changes> JSON
          // (a 14-row batch can exceed 2000 tokens and truncate mid-array).
          max_tokens: images.length > 0 ? 3000 : 2000,
          system: systemBlocks,
          messages: [
            ...history,
            { role: "user", content: userContent },
          ],
        });
        break;
      } catch (err) {
        console.error("Claude attempt", attempt, "failed:", err);
        if (attempt === 2) throw err;
        await new Promise((r) => setTimeout(r, 800));
      }
    }

    if (!response) throw new Error("Failed to get response from Claude");

    const raw = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .join("");

    // --- Parse response ---
    const changesRaw = extractTag(raw, "changes");
    const contextRaw = extractTag(raw, "context");
    const goalRaw = extractTag(raw, "goal");
    const proposeAddressRaw = extractTag(raw, "propose_address");
    const proposeVenueRaw = extractTag(raw, "propose_venue");
    const proposeChangeRaw = extractTag(raw, "propose_change");
    const suggestedRepliesRaw = extractTag(raw, "suggested_replies");
    const clarifyRaw = extractTag(raw, "clarify");
    const scenarioRaw = extractTag(raw, "scenario");
    let displayText = stripTags(raw);

    // --- Past-counterfactual scenario intent (read-only narration) ---
    // Claude flagged a retrospective what-if about a held tradeable. Resolve the
    // asset, run the counterfactual, narrate under the guardrail. Never mutates;
    // does not enter the proposal/mutation branches below.
    if (scenarioRaw) {
      let parsed: Record<string, unknown> = {};
      try { parsed = JSON.parse(scenarioRaw.trim()); } catch {}
      const userMsg = message || "Scenario";
      // Chip-originated intents compute directly; free-typed ones confirm first.
      const mode: ScenarioMode = fromChip ? "compute" : "confirm";
      const res = await dispatchScenario(supabase, userId, userMsg, parsed, (assets ?? []), displayCurrency, used, mode);
      if (res) return res;
    }

    let suggestedReplies: string[] | null = null;
    if (suggestedRepliesRaw) {
      try {
        const parsed = JSON.parse(suggestedRepliesRaw.trim());
        suggestedReplies = sanitizeChips(parsed);
      } catch {
        suggestedReplies = null;
      }
    }

    const conflictingTagCount = [proposeAddressRaw, proposeChangeRaw, clarifyRaw, changesRaw].filter(Boolean).length;
    if (conflictingTagCount > 1) {
      console.warn("Multiple proposal tags in one response:", {
        hasAddress: !!proposeAddressRaw, hasChange: !!proposeChangeRaw,
        hasClarify: !!clarifyRaw, hasChanges: !!changesRaw,
      });
    }

    // A confirmation chip ("Confirm and save", etc.) means "apply" — it must never
    // re-trigger a proposal step. Both the address and change proposal branches
    // skip on a confirmation turn so the model's text/commit response flows through
    // instead of re-emitting the same proposal card (the property-add loop fix).
    const isConfirmationTurn = typeof message === "string" && CONFIRMATION_CHIPS.has(message.trim());

    // --- Address proposal flow (real estate adds / address edits) ---
    // When Claude emits <propose_address>, geocode and return chips — no DB write this turn.
    // Skipped on a confirmation turn: address confirmation uses its own chips
    // ("Yes, that's the address"), so a confirmation chip here would be a stale
    // re-emit — let the model's response (ask for price, or commit) through instead.
    if (proposeAddressRaw && !isConfirmationTurn) {
      const proposedAddress = proposeAddressRaw.trim();
      const geo = await geocodeAddress(proposedAddress, null);

      // No result, or a partial match missing a house number, is not confirmable —
      // ask the user to re-enter rather than forcing the geocoder's best guess.
      if (!geo || !geo.hasHouseNumber) {
        const clarification = `I couldn't confirm "${proposedAddress}" — could you re-enter it with the street, house number, and postcode?`;
        await supabase.from("messages").insert(timestampedPair(
          { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
          { user_id: userId, role: "assistant", content: clarification },
        ));
        return NextResponse.json({ message: clarification, assets: null, remaining: CHAT_DAILY_LIMIT - used });
      }

      // Flag when the geocoder changed the entered postcode or house number instead
      // of presenting its best guess as a clean match. The "Resolved address:" line
      // is always included so the commit turn can still parse the canonical address.
      const match = compareEnteredAddress(proposedAddress, geo);
      const canonicalLine = `Resolved address: ${geo.canonicalAddress}`;
      let confirmationBody = canonicalLine;
      if (match.changed) {
        const enteredBits = [match.enteredHouseNumber, match.enteredPostcode].filter(Boolean).join(" ");
        const enteredPhrase = enteredBits ? `You entered ${enteredBits}, which I couldn't match exactly. ` : "I couldn't match that exactly. ";
        confirmationBody = `${enteredPhrase}The closest match is below — please confirm it's right or send a correction.\n${canonicalLine}`;
      }
      const proposalText = displayText ? `${displayText}\n\n${confirmationBody}` : confirmationBody;
      // Address-confirmation chips are distinct from the commit step's
      // "Confirm and save". Confirming the address only advances to the price
      // question — it never saves the property.
      const suggestedReplies = ["Yes, that's the address", "No, let me correct it"];

      await supabase.from("messages").insert(timestampedPair(
        { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
        { user_id: userId, role: "assistant", content: proposalText, suggested_replies: suggestedReplies },
      ));

      return NextResponse.json({
        message: proposalText,
        suggested_replies: suggestedReplies,
        assets: null,
        remaining: CHAT_DAILY_LIMIT - used,
      });
    }

    // --- Venue proposal flow (ETF adds) ---
    if (proposeVenueRaw) {
      const countryCounts = new Map<string, number>();
      for (const a of currentAssets) {
        if (a.country) countryCounts.set(a.country, (countryCounts.get(a.country) ?? 0) + 1);
      }
      let dominantCountry: string | null = null;
      let maxCount = 0;
      for (const [c, n] of countryCounts) {
        if (n > maxCount) { dominantCountry = c; maxCount = n; }
      }
      const chips = venueChipsFor(dominantCountry ?? "");

      await supabase.from("messages").insert(timestampedPair(
        { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
        { user_id: userId, role: "assistant", content: displayText, suggested_replies: chips },
      ));

      return NextResponse.json({
        message: displayText,
        suggested_replies: chips,
        assets: null,
        remaining: CHAT_DAILY_LIMIT - used,
      });
    }

    // --- Clarify flow (Tier 3 ambiguity resolution) ---
    // When Claude emits <clarify>, ask the question and return chips — no DB write, no resolution.
    if (clarifyRaw && !proposeAddressRaw && !proposeChangeRaw) {
      let parsed: { question: string; options: string[] } | null = null;
      try {
        const obj = JSON.parse(clarifyRaw.trim());
        if (
          typeof obj?.question === "string"
          && Array.isArray(obj?.options)
          && obj.options.every((o: unknown) => typeof o === "string")
        ) {
          parsed = obj;
        }
      } catch {
        parsed = null;
      }

      if (parsed) {
        const chips = sanitizeChips(parsed.options);
        if (chips && chips.length >= 2) {
          const messageText = parsed.question.trim();

          await supabase.from("messages").insert(timestampedPair(
            { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
            { user_id: userId, role: "assistant", content: messageText, suggested_replies: chips },
          ));

          return NextResponse.json({
            message: messageText,
            suggested_replies: chips,
            assets: null,
            remaining: CHAT_DAILY_LIMIT - used,
          });
        }
        // sanitizer dropped chips — fall through to normal text response
        console.warn("clarify chips dropped by sanitizer:", parsed.options);
      }
      // malformed <clarify> — fall through to normal flow
    }

    // --- Change proposal flow (value-mode adds, value_delta edits, removes, batch/screenshot) ---
    // When Claude emits <propose_change>, resolve numbers and return chips — no DB write this turn.
    // Skip if the user just sent a confirmation chip — Claude sometimes echoes <propose_change>
    // in the confirmation response, which would cause the chips to appear a second time.
    if (proposeChangeRaw && !proposeAddressRaw && !isConfirmationTurn) {
      try {
        const proposals = JSON.parse(proposeChangeRaw.trim());
        if (!Array.isArray(proposals) || proposals.length === 0) throw new Error("empty proposals");

        const resolvedLines: string[] = [];
        for (const proposal of proposals) {
          const line = await resolveProposal(proposal, currentAssets);
          resolvedLines.push(line);
        }

        // Narration guard for property proposals: the indicative value is computed
        // by the estimate engine and rendered in the server's Resolved block. If
        // the model's prose introduces any number the engine didn't produce (e.g. a
        // fabricated valuation), drop the prose and keep only the deterministic
        // block — the assistant can never surface an unverified property figure.
        let safeDisplayText = displayText;
        const hasRealEstate = proposals.some((p) => p?.type === "real_estate");
        if (hasRealEstate && displayText && !validateNarration(displayText, extractNumbers(resolvedLines.join(" ")))) {
          safeDisplayText = "";
        }

        const resolvedBlock = `Resolved:\n${resolvedLines.join("\n")}`;
        const proposalText = safeDisplayText ? `${safeDisplayText}\n\n${resolvedBlock}` : resolvedBlock;
        // Pension adds use the intake's own confirmation-echo chips; everything
        // else uses the standard confirm/correct pair.
        const isPensionProposal = proposals.some((p) => p?.type === "pension");
        const proposalChips = isPensionProposal
          ? [...PENSION_ECHO_CHIPS]
          : ["Confirm and save", "No, let me correct it"];

        await supabase.from("messages").insert(timestampedPair(
          { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
          { user_id: userId, role: "assistant", content: proposalText, suggested_replies: proposalChips },
        ));

        return NextResponse.json({
          message: proposalText,
          suggested_replies: proposalChips,
          assets: null,
          remaining: CHAT_DAILY_LIMIT - used,
        });
      } catch (err) {
        if (err instanceof ValueModeError) {
          await supabase.from("messages").insert(timestampedPair(
            { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
            { user_id: userId, role: "assistant", content: err.message },
          ));
          return NextResponse.json({ message: err.message, assets: null, remaining: CHAT_DAILY_LIMIT - used });
        }
        throw err;
      }
    }

    let portfolioChanged = false;
    let needsBackfill = false;
    let hasAdds = false;
    let analyticsEvent: string | null = null;
    // Earliest acquisition date among this turn's adds/removes — every snapshot
    // row from this date forward must be rebuilt (not upsert-skipped) to
    // actually include/exclude the asset. See agent-tools.ts's commitMutationTool
    // for the canonical computation this mirrors.
    let rebuildFrom: string | null = null;

    // --- Apply portfolio changes ---
    if (changesRaw) {
      try {
        const changes = JSON.parse(changesRaw.trim());
        if (Array.isArray(changes) && changes.length > 0) {
          // Trigger backfill for multi-action turns or any change with a buy_date
          // older than 30 days (historical context that affects the chart shape).
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
          const touchesRealEstateHistory = changes.some((c) => {
            if (c.action !== "edit" && c.action !== "remove") return false;
            if (!c.name) return false;
            const nm = c.name.toLowerCase();
            const m = currentAssets.find((a) =>
              a.name.toLowerCase() === nm ||
              (a.symbol && a.symbol.toLowerCase() === nm)
            );
            return !!m && m.type === "real_estate";
          });
          if (
            changes.length > 1 ||
            changes.some((c) => c.buy_date && c.buy_date < thirtyDaysAgo) ||
            touchesRealEstateHistory
          ) {
            needsBackfill = true;
          }
          hasAdds = changes.some((c) => c.action === "add");
          if (isNewUser && hasAdds) {
            analyticsEvent = "first_asset_added";
          } else if ((recentMutations || []).length === 0) {
            analyticsEvent = "first_chat_mutation";
          }
          const validationError = validatePortfolioChanges(changes, currentAssets);
          if (validationError) {
            await supabase.from("messages").insert(timestampedPair(
              { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
              { user_id: userId, role: "assistant", content: validationError },
            ));
            return NextResponse.json({ message: validationError, assets: null, remaining: CHAT_DAILY_LIMIT - used });
          }

          // Geocoding gate: validate + resolve all real_estate addresses before any DB write.
          // All-or-nothing: a bad address on any change in the turn rejects the whole turn.
          const resolvedCanonicalAddresses: string[] = [];
          for (const change of changes) {
            if (!change.address) continue;

            const existingForEdit = change.action === "edit"
              ? currentAssets.find((a) =>
                  a.name.toLowerCase() === change.name?.toLowerCase() ||
                  (a.symbol && a.symbol.toLowerCase() === change.name?.toLowerCase())
                )
              : null;

            const isRealEstate =
              change.type === "real_estate" ||
              (change.action === "edit" && existingForEdit?.type === "real_estate");

            if (!isRealEstate) continue;

            const countryHint = change.country ?? existingForEdit?.country ?? null;
            const geo = await geocodeAddress(change.address, countryHint);

            if (!geo || !geo.hasHouseNumber) {
              const clarification = "I couldn't find that address. Could you double-check the spelling or share a postcode?";
              await supabase.from("messages").insert(timestampedPair(
                { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
                { user_id: userId, role: "assistant", content: clarification },
              ));
              return NextResponse.json({ message: clarification, assets: null, remaining: CHAT_DAILY_LIMIT - used });
            }

            // Replace user's raw input with Nominatim's canonical address and attach coords.
            change.address = geo.canonicalAddress;
            change.latitude = geo.latitude;
            change.longitude = geo.longitude;
            resolvedCanonicalAddresses.push(geo.canonicalAddress);
          }

          // Use the most-recent assistant message timestamp as the proposal time.
          // Enables the freshness check in apply-changes for confirmed proposals.
          const proposalTimestamp = (recentMessages || []).find((m) => m.role === "assistant")?.created_at ?? null;

          const { changed, duplicateWarnings, fxWarnings, mutationMetas, failures } = await applyPortfolioChanges({
            supabase,
            userId,
            changes,
            currentAssets,
            contextNote: contextRaw?.trim() || null,
            proposalTimestamp,
          });
          portfolioChanged = changed;

          {
            const considerRebuildDate = (d: string | null | undefined) => {
              if (!d) return;
              if (rebuildFrom === null || d < rebuildFrom) rebuildFrom = d;
            };
            for (const c of changes) {
              if (c.action === "add") {
                considerRebuildDate(c.buy_date ?? null);
              } else if (c.action === "remove") {
                const matching = currentAssets.filter(
                  (a) => a.name.toLowerCase() === c.name?.toLowerCase() ||
                         (a.symbol && a.symbol.toLowerCase() === c.name?.toLowerCase())
                );
                for (const existing of matching) {
                  considerRebuildDate(existing.buy_date ?? existing.created_at?.slice(0, 10) ?? null);
                }
              } else if (c.action === "edit" && c.name) {
                const nm = c.name.toLowerCase();
                const m = currentAssets.find((a) =>
                  a.name.toLowerCase() === nm ||
                  (a.symbol && a.symbol.toLowerCase() === nm)
                );
                if (m && m.type === "real_estate") {
                  considerRebuildDate(m.buy_date ?? m.created_at?.slice(0, 10) ?? null);
                }
              }
            }
          }

          if (mutationMetas.length > 0) {
            after(async () => {
              try {
                const supabaseAfter = createServerSupabase();
                for (const meta of mutationMetas) {
                  const ctx = await generateMarketContext(meta.symbol, meta.occurredAt, meta.assetType);
                  if (ctx) {
                    await supabaseAfter.from("mutations").update({ market_context: ctx }).eq("id", meta.id);
                  }
                }
              } catch (err) {
                console.error("market_context update failed", err);
              }
            });
          }
          if (duplicateWarnings.length > 0) {
            const suffix = duplicateWarnings.join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
          if (fxWarnings.length > 0) {
            const suffix = fxWarnings.join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
          if (failures.length > 0) {
            const names = failures.map((f) => f.name).join(", ");
            const suffix = failures.length === 1
              ? `Couldn't record ${names} — please try that one again.`
              : `Couldn't record ${failures.length} positions (${names}) — please try those again.`;
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
          if (resolvedCanonicalAddresses.length > 0 && portfolioChanged) {
            const suffix = resolvedCanonicalAddresses.map((addr) => `Saved as ${addr}.`).join(" ");
            displayText = displayText ? `${displayText}\n\n${suffix}` : suffix;
          }
        }
      } catch (parseErr) {
        if (parseErr instanceof ValueModeError) {
          await supabase.from("messages").insert(timestampedPair(
            { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
            { user_id: userId, role: "assistant", content: parseErr.message },
          ));
          return NextResponse.json({ message: parseErr.message, assets: null, remaining: CHAT_DAILY_LIMIT - used });
        }
        if (!(parseErr instanceof SyntaxError)) throw parseErr;
        console.error("Changes parse failed:", parseErr);
      }
    }

    // --- Fetch updated assets if changed ---
    let updatedAssets = null;
    if (portfolioChanged) {
      const { data: newAssets } = await supabase
        .from("assets")
        .select("*")
        .eq("user_id", userId);
      updatedAssets = newAssets;
    }

    const postAddAssetCount = portfolioChanged
      ? (updatedAssets?.length ?? currentAssets.length)
      : currentAssets.length;

    // --- Handle goal ---
    if (goalRaw) {
      try {
        const goal = JSON.parse(goalRaw.trim());
        // Convert goal target from display currency to USD for storage.
        let targetUsd: number | null = goal.target_value ?? null;
        if (targetUsd !== null && goal.currency && goal.currency !== "USD") {
          const converted = await toUsd(targetUsd, goal.currency);
          if (converted !== null) targetUsd = Math.round(converted);
        }
        await supabase.from("goals").insert({
          user_id: userId,
          title: goal.title,
          target_value: targetUsd,
          target_date: goal.target_date || null,
        });
      } catch (err) {
        console.error("Goal parse failed:", err);
      }
    }

    // --- Save user + assistant messages together after Claude succeeds ---
    await supabase.from("messages").insert(timestampedPair(
      { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
      { user_id: userId, role: "assistant", content: displayText, suggested_replies: suggestedReplies },
    ));

    // --- Profile extraction ---
    // Onboarding transition: synchronous. User just added their first asset — run now so
    // Profile is populated when they land on it. ~1.5s latency is acceptable here.
    if (isNewUser && portfolioChanged && message && displayText) {
      try {
        await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
      } catch (err) {
        // Non-critical — silently fall back to deferred extraction on next session
        console.error("Onboarding extraction failed:", err);
      }
    }

    // Mark the cached Pulse STALE (do not delete) so a subsequent forced
    // /api/vitals refetch regenerates against the new portfolio — while the last
    // good sentence survives as a fallback if that regeneration fails. The banner
    // then keeps showing the previous Pulse instead of an empty / forever-skeleton
    // slot, and is replaced only once a fresh Pulse is successfully generated.
    if (portfolioChanged) {
      try {
        await supabase
          .from("highlights")
          .update({ expires_at: new Date(0).toISOString() })
          .eq("user_id", userId)
          .in("type", ["pulse", "pulse_liquid"]);
      } catch (err) {
        Sentry.captureException(err, { tags: { background: "pulse-cache-invalidation" } });
      }
    }

    // Background: refresh insight whenever the portfolio changes.
    // Delete the stale cached insight first so the next client fetch never sees outdated content.
    // If assets remain, generate and cache a fresh insight immediately.
    if (portfolioChanged && updatedAssets !== null) {
      after(async () => {
        try {
          const supabaseAfter = createServerSupabase();
          await supabaseAfter.from("highlights").delete().eq("user_id", userId).eq("type", "insight");
          if (updatedAssets.length === 0) return;
          const detail = await generateInsight(updatedAssets);
          if (!detail) return;
          const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          await supabaseAfter.from("highlights").insert({
            user_id: userId,
            type: "insight",
            detail,
            expires_at: expiresAt,
            seen: false,
          });
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "insight-regen" } });
        }
      });
    }

    // Background: text-only turns for existing users
    if (message && displayText && !isNewUser && !changesRaw) {
      after(async () => {
        try {
          await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "profile-extraction" } });
        }
      });
    }

    // Background: fire after any successful asset add for existing users
    if (!isNewUser && hasAdds && portfolioChanged && message && displayText) {
      after(async () => {
        try {
          await extractProfileUpdate(userId, message, displayText, profile, userData?.fingerprint ?? null, postAddAssetCount);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "profile-extraction" } });
        }
      });
    }
    if (portfolioChanged) {
      after(async () => {
        try {
          await writeSnapshot(userId);
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "snapshot" } });
        }
      });
      if (needsBackfill) {
        after(async () => {
          try {
            await backfillSnapshots(userId, rebuildFrom);
          } catch (err) {
            Sentry.captureException(err, { tags: { background: "backfill-snapshots" } });
          }
        });
      }
    }

    return NextResponse.json({
      message: displayText || "Done.",
      assets: updatedAssets,
      remaining: CHAT_DAILY_LIMIT - used,
      suggested_replies: suggestedReplies,
      ...(analyticsEvent ? { analyticsEvent } : {}),
    });
  } catch (err) {
    console.error("[/api/chat] unhandled error:", err);
    Sentry.captureException(err, { tags: { route: "POST /api/chat" } });
    return NextResponse.json(
      { message: "Couldn't reach the assistant. Please try again." },
      { status: 500 }
    );
  }
}
