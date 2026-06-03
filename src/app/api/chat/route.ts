import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse, after } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";
import { buildStaticSystem, buildDynamicContext, buildOnboardingPrompt } from "@/lib/claude";
import { isSupportedCurrency, formatMoney, setUsdRate, type DisplayCurrency } from "@/lib/money";
import { toUsd, getUsdRates } from "@/lib/fx";
import { extractProfileUpdate } from "@/lib/profile-extractor";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
import { validateEnv } from "@/lib/env";
import { applyPortfolioChanges, ValueModeError } from "@/lib/apply-changes";
import { generateMarketContext } from "@/lib/market-context";
import { generateInsight } from "@/lib/insight-generator";
import { validatePortfolioChanges } from "@/lib/validations";
import { geocodeAddress } from "@/lib/geocode";
import { venueChipsFor } from "@/lib/venues";
import { CHAT_DAILY_LIMIT } from "@/lib/constants";
import {
  ALLOWED_IMAGE_TYPES, ALLOWED_CHIPS, CONFIRMATION_CHIPS,
  sanitizeChips, stripTags, extractTag, timestampedPair,
} from "@/lib/chat-helpers";
import { resolveProposal } from "@/lib/proposal-resolver";
import type { CurrentAssetLight } from "@/lib/proposal-resolver";
import { narrateScenario } from "@/lib/scenario/narrate";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import { assembleCounterfactual } from "@/lib/scenario/counterfactual-assemble";
import { assemblePresent } from "@/lib/scenario/present-assemble";
import { assembleProject } from "@/lib/scenario/project-assemble";
import { resolveScenarioAsset, resolveHeldAsset, type AssetRef } from "@/lib/scenario/resolve-asset";
import type { Modification } from "@/lib/scenario/engine";
import { extractNumbers } from "@/lib/narrate/guardrail";
import type { ScenarioResult } from "@/lib/scenario/result";

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

function fmtScenarioDate(d: string | null): string {
  if (!d) return "";
  const [y, mo, day] = d.slice(0, 10).split("-").map(Number);
  if (!y) return d;
  return new Date(y, (mo ?? 1) - 1, day ?? 1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Chat-initiated past-counterfactual. Resolves the referenced held tradeable,
// runs the shared counterfactual assembly, and narrates the result under the
// guardrail. Read-only — writes only the user + assistant message pair. A
// non-tradeable / ambiguous / not-held reference yields a graceful clarification
// rather than a fabricated result.
async function handleScenarioIntent(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMessage: string,
  assetQuery: string,
  assets: AssetRef[],
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse> {
  const reply = (content: string, extra?: Record<string, unknown>) =>
    scenarioReply(supabase, userId, userMessage, content, used, extra);

  const res = resolveScenarioAsset(assets, assetQuery);
  if (res.kind === "ambiguous") {
    return reply(`Happy to look back — which position did you mean: ${res.matches.map((a) => a.name).join(", ")}?`);
  }
  if (res.kind === "non_tradeable") {
    return reply(`Look-back works for held tradeable positions — stocks, ETFs, or crypto. "${res.asset.name}" isn't one of those.`);
  }
  if (res.kind === "none") {
    return reply(`I don't see a held position matching "${assetQuery}". Look-back works for a specific tradeable you hold — which one did you mean?`);
  }

  const target = res.asset;

  // Free-typed: confirm the resolved intent before computing.
  if (mode === "confirm") {
    return reply(`Look back at what ${target.name} has done for you?`, {
      suggested_replies: SHOW_ME_CHIPS,
      scenarioPending: { kind: "counterfactual", asset: assetQuery },
    });
  }

  const result = await assembleCounterfactual(supabase, userId, target.id, "All");
  if (!result.ok) return reply(`I couldn't reconstruct ${target.name} — ${result.message}`);

  // Display formatting against the real server FX rates.
  const usdRates = await getUsdRates();
  const rate = usdRates[displayCurrency];
  if (displayCurrency !== "USD" && rate) setUsdRate(displayCurrency, rate);
  const m = (usd: number) => formatMoney(usd, "USD", displayCurrency);
  const dispRate = usdRates[displayCurrency] ?? 1;
  const toDisp = (usd: number) => usd * dispRate;

  const d = result.data;
  const amt = m(Math.abs(d.contribution));
  const verb = d.contribution >= 0 ? "added" : "cost";
  const diaryNotes = d.diaryContext
    .filter((x) => x.personal_context)
    .map((x) => ({ date: fmtScenarioDate(x.occurred_at), note: x.personal_context as string, market: x.market_context ?? undefined }));

  const figures = [amt];
  for (const dn of diaryNotes) {
    figures.push(...extractNumbers(dn.date), ...extractNumbers(dn.note));
    if (dn.market) figures.push(...extractNumbers(dn.market));
  }

  const description = `Look back at ${d.asset.name}: it has ${verb} ${amt} versus the capital deployed (gain or loss; the capital is kept as cash, not redeployed).`;
  const fallback = `${d.asset.name} has ${verb} ${amt} ${d.contribution >= 0 ? "to your net worth since you bought it." : "since you bought it."}`;

  const scenarioResult: ScenarioResult = {
    kind: "counterfactual",
    assetName: d.asset.name,
    actual: d.actualSeries.map((p) => ({ t: Date.parse(p.date), v: toDisp(p.valueUsd) })),
    counterfactual: d.counterfactualSeries.map((p) => ({ t: Date.parse(p.date), v: toDisp(p.valueUsd) })),
    symbol: SCENARIO_SYMBOL[displayCurrency] ?? "€",
  };

  const { narration } = await narrateScenario({ userMessage, description, figures, fallback, diaryContext: diaryNotes });
  return reply(narration, { scenarioResult });
}

type PresentAsset = {
  id: string;
  name: string;
  type: string;
  value: number;
  currency: string | null;
  symbol: string | null;
  mortgage_balance: number | null;
};

const fmtScenarioPct = (n: number | null): string =>
  n == null ? "—" : new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + "%";

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

// Chat-initiated PRESENT scenario: translate the value-based ops (resolving held
// assets, converting display → native amounts server-side) into engine
// Modifications, run the shared present assembly, narrate Current vs Scenario.
// Read-only — writes only the message pair.
async function handlePresentScenario(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMessage: string,
  rawMods: unknown[],
  assets: PresentAsset[],
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse> {
  const reply = (content: string, extra?: Record<string, unknown>) =>
    scenarioReply(supabase, userId, userMessage, content, used, extra);

  // Free-typed: confirm before computing (no resolution/compute yet).
  if (mode === "confirm") {
    const single = rawMods.length === 1 && typeof (rawMods[0] as Record<string, unknown>)?.asset === "string"
      ? (rawMods[0] as Record<string, unknown>).asset as string
      : null;
    const interpretation = single
      ? `Show how a change to ${single} would reshape your portfolio?`
      : "Show how that would reshape your portfolio?";
    return reply(interpretation, {
      suggested_replies: SHOW_ME_CHIPS,
      scenarioPending: { kind: "present", modifications: rawMods },
    });
  }

  const refs: AssetRef[] = assets.map((a) => ({ id: a.id, name: a.name, type: a.type, symbol: a.symbol }));

  const usdRates = await getUsdRates();
  const dispRate = usdRates[displayCurrency];
  if (displayCurrency !== "USD" && dispRate) setUsdRate(displayCurrency, dispRate);
  const toNative = (displayAmt: number, cur: string): number => {
    const usd = displayCurrency === "USD" ? displayAmt : displayAmt / (usdRates[displayCurrency] ?? 1);
    return cur === "USD" ? usd : usd * (usdRates[cur] ?? 1);
  };

  const mods: Modification[] = [];
  for (const raw of rawMods) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const op = o.op;

    if (op === "add") {
      const name = typeof o.name === "string" ? o.name : null;
      const amount = Number(o.amount);
      if (!name || !Number.isFinite(amount) || amount <= 0) continue;
      const type = typeof o.assetType === "string" ? o.assetType : typeof o.type === "string" ? o.type : "etf";
      mods.push({ kind: "addByValue", name, type, currency: displayCurrency, nativeValue: amount });
      continue;
    }
    if (op === "payMortgage") {
      const amount = Number(o.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      const property = assets.find((a) => a.type === "real_estate" && Number(a.mortgage_balance ?? 0) > 0);
      if (!property) return reply("There's no mortgage on file to pay down.");
      mods.push({ kind: "payDownMortgage", assetId: property.id, amount: toNative(amount, property.currency || "USD") });
      const cash = assets
        .filter((a) => a.type === "cash" || a.type === "pension")
        .sort((x, y) => Number(y.value) - Number(x.value))[0];
      if (cash) mods.push({ kind: "setValue", assetId: cash.id, nativeValue: Math.max(0, Number(cash.value) - toNative(amount, cash.currency || "USD")) });
      continue;
    }

    const assetQ = typeof o.asset === "string" ? o.asset : null;
    if (!assetQ) continue;
    const res = resolveHeldAsset(refs, assetQ);
    if (res.kind === "ambiguous") return reply(`Which position did you mean: ${res.matches.map((a) => a.name).join(", ")}?`);
    if (res.kind === "none") return reply(`I don't see a held position matching "${assetQ}". Which one did you mean?`);
    const full = assets.find((a) => a.id === res.asset.id);
    if (!full) continue;

    if (op === "remove") {
      mods.push({ kind: "remove", assetId: full.id });
    } else if (op === "set") {
      const v = Number(o.value);
      if (Number.isFinite(v) && v >= 0) mods.push({ kind: "setValue", assetId: full.id, nativeValue: toNative(v, full.currency || "USD") });
    } else if (op === "sell" || op === "reduce") {
      const amt = Number(o.amount);
      if (Number.isFinite(amt) && amt > 0) mods.push({ kind: "setValue", assetId: full.id, nativeValue: Math.max(0, Number(full.value) - toNative(amt, full.currency || "USD")) });
    }
  }

  if (mods.length === 0) {
    return reply("I couldn't read that scenario — could you restate which positions to change and by how much?");
  }

  const { comparison } = await assemblePresent(supabase, userId, mods);
  const m = (usd: number) => formatMoney(usd, "USD", displayCurrency);
  const c = comparison.current, s = comparison.scenario, d = comparison.deltas;
  const nw = m(s.netWorthUsd);
  const delta = m(Math.abs(d.netWorthUsd));
  const sign = d.netWorthUsd >= 0 ? "+" : "−";
  const conCur = fmtScenarioPct(c.topSingleNameConcentrationPct);
  const conScn = fmtScenarioPct(s.topSingleNameConcentrationPct);
  const figures = [nw, delta, conCur, conScn];
  const description = `Present hypothetical. Net worth ${nw} (${sign}${delta} versus current). Single-name concentration ${conCur} → ${conScn}.`;
  const fallback = `In that scenario your net worth is ${nw}, ${sign}${delta} versus today, with single-name concentration moving from ${conCur} to ${conScn}.`;
  const scenarioResult: ScenarioResult = { kind: "present", current: c, scenario: s, displayCurrency };
  const { narration } = await narrateScenario({ userMessage, description, figures, fallback });
  return reply(narration, { scenarioResult });
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

// Route a parsed scenario intent to the matching handler. Returns null when the
// intent isn't a recognised scenario (so the caller falls through to normal flow).
async function dispatchScenario(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
  userMsg: string,
  parsed: Record<string, unknown>,
  assets: unknown[],
  displayCurrency: DisplayCurrency,
  used: number,
  mode: ScenarioMode,
): Promise<NextResponse | null> {
  if (parsed.kind === "counterfactual" && typeof parsed.asset === "string") {
    return handleScenarioIntent(supabase, userId, userMsg, parsed.asset, assets as AssetRef[], displayCurrency, used, mode);
  }
  if (parsed.kind === "present" && Array.isArray(parsed.modifications)) {
    return handlePresentScenario(supabase, userId, userMsg, parsed.modifications, assets as PresentAsset[], displayCurrency, used, mode);
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

    // --- Address proposal flow (real estate adds / address edits) ---
    // When Claude emits <propose_address>, geocode and return chips — no DB write this turn.
    if (proposeAddressRaw) {
      const proposedAddress = proposeAddressRaw.trim();
      const geo = await geocodeAddress(proposedAddress, null);

      if (!geo || !geo.hasHouseNumber) {
        const clarification = `I couldn't find "${proposedAddress}" — could you double-check the spelling or share a postcode?`;
        await supabase.from("messages").insert(timestampedPair(
          { user_id: userId, role: "user", content: message || "[screenshot uploaded]" },
          { user_id: userId, role: "assistant", content: clarification },
        ));
        return NextResponse.json({ message: clarification, assets: null, remaining: CHAT_DAILY_LIMIT - used });
      }

      const canonicalLine = `Resolved address: ${geo.canonicalAddress}`;
      const proposalText = displayText ? `${displayText}\n\n${canonicalLine}` : canonicalLine;
      const suggestedReplies = ["Confirm and save", "No, let me correct it"];

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
    const isConfirmationTurn = typeof message === "string" && CONFIRMATION_CHIPS.has(message.trim());
    if (proposeChangeRaw && !proposeAddressRaw && !isConfirmationTurn) {
      try {
        const proposals = JSON.parse(proposeChangeRaw.trim());
        if (!Array.isArray(proposals) || proposals.length === 0) throw new Error("empty proposals");

        const resolvedLines: string[] = [];
        for (const proposal of proposals) {
          const line = await resolveProposal(proposal, currentAssets);
          resolvedLines.push(line);
        }

        const resolvedBlock = `Resolved:\n${resolvedLines.join("\n")}`;
        const proposalText = displayText ? `${displayText}\n\n${resolvedBlock}` : resolvedBlock;
        const proposalChips = ["Confirm and save", "No, let me correct it"];

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

    // --- Apply portfolio changes ---
    if (changesRaw) {
      try {
        const changes = JSON.parse(changesRaw.trim());
        if (Array.isArray(changes) && changes.length > 0) {
          // Trigger backfill for multi-action turns or any change with a buy_date
          // older than 30 days (historical context that affects the chart shape).
          const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString().slice(0, 10);
          if (
            changes.length > 1 ||
            changes.some((c) => c.buy_date && c.buy_date < thirtyDaysAgo)
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

    // Background: drop stale pulse whenever the portfolio changes so the next
    // /vitals load regenerates it via generatePulse rather than serving old text.
    if (portfolioChanged) {
      after(async () => {
        try {
          const supabaseAfter = createServerSupabase();
          await supabaseAfter.from("highlights").delete().eq("user_id", userId).eq("type", "pulse");
        } catch (err) {
          Sentry.captureException(err, { tags: { background: "pulse-cache-invalidation" } });
        }
      });
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
            await backfillSnapshots(userId);
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
