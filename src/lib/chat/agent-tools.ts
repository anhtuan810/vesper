// Tool layer for the agent chat loop. Every tool WRAPS existing deterministic code
// (engines, assemblies, resolvers, the validation gate, and the proven mutation
// commit path) — no math or write logic is reimplemented here. Read-only tools
// return structured results the client renders as the existing cards; write tools
// reuse resolveProposal (propose, no write) and applyPortfolioChanges (commit).

import * as Sentry from "@sentry/nextjs";
import type Anthropic from "@anthropic-ai/sdk";
import type { createServerSupabase } from "@/lib/supabase";
import { formatMoney, setUsdRate, isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import { computeReadout, type ScenarioAsset, type Modification } from "@/lib/scenario/engine";
import { assemblePresent } from "@/lib/scenario/present-assemble";
import { assembleProject } from "@/lib/scenario/project-assemble";
import { assembleCounterfactual } from "@/lib/scenario/counterfactual-assemble";
import { hypotheticalBuyGrowth, buyPriceUsd } from "@/lib/scenario/hypothetical";
import { fetchHistoricalSeries, getMonthClosingPrice } from "@/lib/prices";
import { getHistoricalUsdRates } from "@/lib/fx";
import { normalizeCryptoSymbol } from "@/lib/symbol-aliases";
import { parseAcquisitionMonth } from "@/lib/acquisition-date";
import { resolveScenarioAsset, resolveHeldAsset, type AssetRef } from "@/lib/scenario/resolve-asset";
import { resolveMarketSymbol } from "@/lib/scenario/resolve-market-symbol";
import { validateScenarioIntent, resolveBuyDate } from "@/lib/scenario/validate-intent";
import { resolveProposal, type ProposalChange, type CurrentAssetLight } from "@/lib/proposal-resolver";
import { applyPortfolioChanges, ValueModeError, type MutationMeta } from "@/lib/apply-changes";
import { validatePortfolioChanges } from "@/lib/validations";
import { geocodeAddress } from "@/lib/geocode";
import type { PricePoint } from "@/lib/scenario/counterfactual";
import type { ScenarioResult } from "@/lib/scenario/result";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto", "gold"]);

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  displayCurrency: DisplayCurrency;
  usdRates: Record<string, number>;
  /** Full asset rows (select *), already loaded by the route. */
  currentAssets: Array<Record<string, unknown>>;
  now: Date;
}

export interface CommitOutcome {
  changed: boolean;
  mutationMetas: MutationMeta[];
  analyticsEvent: string | null;
  needsBackfill: boolean;
  hasAdds: boolean;
  // Earliest acquisition date among this batch's adds/removes — every snapshot
  // row from this date forward must be rebuilt to include/exclude the asset
  // (upsert-skip would otherwise leave stale rows behind it). Null when no
  // change in the batch actually altered the historical asset set.
  rebuildFrom: string | null;
}

export interface ToolOutcome {
  /** JSON the model sees as the tool result. */
  forModel: Record<string, unknown>;
  /** Formatted figures produced this call, for the narration guardrail allowlist. */
  figures?: string[];
  /** Card to attach to the final assistant message and persist (rehydrates on reload). */
  card?: ScenarioResult;
  /** propose_mutation: surface confirm chips, no write. */
  proposal?: { resolvedText: string; chips: string[] };
  /** commit_mutation: the executed write outcome, for post-commit background jobs. */
  commit?: CommitOutcome;
}

const SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£" };
const CATEGORY_LABEL: Record<string, string> = { property: "Property", markets: "Public markets", reserves: "Reserves", crypto: "Crypto" };

// Structured shape for one add/edit/remove. `name` is REQUIRED — the write path
// (applyPortfolioChanges) keys the asset row + dedup on it and SILENTLY SKIPS any
// change with an empty name, so an unstructured schema that let the model omit
// `name` (emitting only `symbol`) caused whole screenshot batches to land as
// "committed: false, nothing saved". The per-class fields below (mortgage_*,
// pension_*, bond) are declared explicitly rather than relying on open
// `additionalProperties` alone — an undeclared field is one the model doesn't
// know to fill: a property add that omits `mortgage_balance` silently records as
// "owned outright", so the details a class needs must be visible in the schema.
// The schema stays open (additionalProperties is not closed) so the rarer write
// fields it doesn't enumerate (value_delta, sell_date, …) still pass through.
const CHANGE_ITEM_SCHEMA = {
  type: "object",
  description: "One portfolio change. Always include `name` — for a listed security it may equal the ticker (e.g. \"AAPL\"), but it must never be empty.",
  properties: {
    action: { type: "string", enum: ["add", "edit", "remove"] },
    name: { type: "string", description: "REQUIRED. The position's display name — a company/asset name or its ticker (e.g. \"Apple\", \"AAPL\", \"Bitcoin\"). Never empty." },
    new_name: { type: "string", description: "For a rename edit only." },
    type: { type: "string", enum: ["stocks", "etf", "crypto", "gold", "cash", "bonds", "pension", "real_estate", "other"], description: "Asset type; use \"stocks\" for a listed equity, \"bonds\" for a bond." },
    symbol: { type: "string", description: "Market ticker for a tradeable (e.g. AAPL, BTC, VWCE.DE)." },
    units: { type: "number", description: "Quantity held (shares / coins / oz)." },
    value: { type: "number", description: "Monetary amount: the position's current value (a value-mode add or a set). For real_estate, the property's current market value." },
    currency: { type: "string", enum: ["EUR", "USD", "GBP"] },
    buy_price: { type: "number", description: "Purchase price. For real_estate, the price paid at acquisition (used to index an estimated current value when no value is given)." },
    buy_date: { type: "string", description: "Acquisition date/month/year or a relative phrase; omit if unknown." },
    removal_reason: { type: "string", enum: ["sold", "mistake"] },
    address: { type: "string", description: "Street address for a real-estate add/edit." },
    country: { type: "string" },
    // ── Real-estate / mortgage ──
    mortgage_balance: { type: "number", description: "real_estate ONLY, REQUIRED on a property add: the outstanding mortgage balance, in the property's currency. Set 0 ONLY when the user confirms the property is owned free and clear. NEVER omit this on a property add — an omitted balance is silently recorded as \"owned outright\", which is the wrong default when there is a mortgage." },
    mortgage_rate: { type: "number", description: "Annual mortgage interest rate as a percent (e.g. 3.5 for 3.5%). REQUIRED on a property add whenever mortgage_balance > 0 (pass 0 for an interest-free loan). Also reused as a pension pot's annual growth assumption." },
    monthly_payment: { type: "number", description: "Monthly mortgage payment, in the property's currency. REQUIRED on a property add whenever mortgage_balance > 0." },
    mortgage_type: { type: "string", enum: ["annuity", "linear", "interest_only"], description: "Mortgage repayment structure. REQUIRED on a property add whenever mortgage_balance > 0." },
    mortgage_start_date: { type: "string", description: "When the mortgage started (year, year-month, or full date)." },
    mortgage_end_date: { type: "string", description: "When the mortgage is due to be repaid (year, year-month, or full date). For an interest_only mortgage this is what yields a payoff date, so capture it when known." },
    property_type: { type: "string", description: "e.g. apartment, house, land." },
    size_sqm: { type: "number", description: "Floor area in square metres." },
    // ── Pension ──
    pension_kind: { type: "string", enum: ["dc", "db", "state"], description: "Pension shape: dc = workplace/private pot (owned balance), db = company defined-benefit (income), state = State pension (income)." },
    annual_income: { type: "number", description: "For a db/state pension: the annual income it will pay." },
    monthly_contribution: { type: "number", description: "For a dc pension pot: monthly amount paid in." },
    access_age: { type: "integer", description: "Age at which the pension can be accessed." },
    pension_provider: { type: "string", description: "Pension provider or scheme name." },
    // ── Bond ──
    coupon_rate: { type: "number", description: "Bond annual coupon rate as a percent." },
    maturity_date: { type: "string", description: "Bond maturity date (year, year-month, or full date)." },
    issuer: { type: "string", description: "Bond issuer." },
    isin: { type: "string", description: "Bond ISIN." },
  },
  required: ["action", "name"],
};

// ── Tool schemas (given to Claude) ─────────────────────────────────────────────
export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  { name: "get_net_worth", description: "The user's current net worth and top-line vitals. Use before relating any figure to their net worth.", input_schema: { type: "object", properties: {} } },
  { name: "get_holdings", description: "List the user's current holdings (name, category, value).", input_schema: { type: "object", properties: {} } },
  { name: "get_vitals", description: "Allocation by category, single-name concentration, and mortgage LTV.", input_schema: { type: "object", properties: {} } },
  {
    name: "present_scenario",
    description: "Compute a present-tense rearrangement of what the user holds now (sell/set/remove/add/payMortgage). Read-only.",
    input_schema: {
      type: "object",
      properties: {
        modifications: {
          type: "array",
          description: "Value-based ops in the user's display currency.",
          items: { type: "object" },
        },
      },
      required: ["modifications"],
    },
  },
  {
    name: "future_projection",
    description: "Project net worth forward (mode 'trajectory') or solve the contribution to reach a target (mode 'solve'). Read-only.",
    input_schema: {
      type: "object",
      properties: {
        mode: { type: "string", enum: ["trajectory", "solve"] },
        horizonYears: { type: "number" },
        contribution: { type: "object", properties: { amount: { type: "number" }, frequency: { type: "string", enum: ["monthly", "yearly"] } } },
        target: { type: "number" },
        targetYear: { type: "number" },
        frequency: { type: "string", enum: ["monthly", "yearly"] },
      },
      required: ["mode"],
    },
  },
  {
    name: "counterfactual",
    description: "Look back at what a HELD tradeable position (stock/ETF/crypto) has contributed versus the capital deployed. Read-only.",
    input_schema: { type: "object", properties: { asset: { type: "string" } }, required: ["asset"] },
  },
  {
    name: "hypothetical_buy",
    description: "Standalone growth of a hypothetical past purchase of any market asset (held or not): what 'N units' or 'a cash amount' on a date would be worth today. Read-only.",
    input_schema: {
      type: "object",
      properties: {
        symbolHint: { type: "string", description: "Asset name or ticker." },
        dateHint: { type: "string", description: "ISO date, a relative token like '5y'/'18m', or omit." },
        units: { type: "number", description: "Quantity of the asset (e.g. 1 for '1 BTC'). A bare number next to an asset name is units, not money." },
        amount: { type: "number", description: "A cash amount to invest." },
        currency: { type: "string", enum: ["EUR", "USD", "GBP"] },
      },
      required: ["symbolHint"],
    },
  },
  { name: "resolve_asset", description: "Resolve a reference to one of the user's HELD positions.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  { name: "resolve_symbol", description: "Resolve a free-text asset name/ticker to a market symbol.", input_schema: { type: "object", properties: { hint: { type: "string" } }, required: ["hint"] } },
  {
    name: "propose_mutation",
    description: "Resolve a portfolio change (add/edit/remove) into a confirmable proposal. Does NOT write — surfaces confirm chips. Call this for any stated completed action before committing.",
    input_schema: { type: "object", properties: { changes: { type: "array", items: CHANGE_ITEM_SCHEMA } }, required: ["changes"] },
  },
  {
    name: "commit_mutation",
    description: "Apply a portfolio change to the database. Every change MUST carry a non-empty `name` (a rowless name is dropped). ONLY call after the user has explicitly confirmed a prior propose_mutation — except a direct tradeable add / screenshot import, which commits without a proposal.",
    input_schema: { type: "object", properties: { changes: { type: "array", items: CHANGE_ITEM_SCHEMA }, contextNote: { type: "string" } }, required: ["changes"] },
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function seed(ctx: ToolContext) {
  if (ctx.displayCurrency !== "USD" && ctx.usdRates[ctx.displayCurrency]) setUsdRate(ctx.displayCurrency, ctx.usdRates[ctx.displayCurrency]);
}
const fmt = (ctx: ToolContext) => (usd: number) => formatMoney(usd, "USD", ctx.displayCurrency);
const dispRate = (ctx: ToolContext) => ctx.usdRates[ctx.displayCurrency] ?? 1;
const assetRefs = (ctx: ToolContext): AssetRef[] =>
  ctx.currentAssets.map((a) => ({ id: String(a.id), name: String(a.name), type: String(a.type), symbol: (a.symbol as string | null) ?? null }));

function currentNetWorthUsd(ctx: ToolContext): number {
  return computeReadout(ctx.currentAssets as unknown as ScenarioAsset[], ctx.usdRates, ctx.now).netWorthUsd;
}

// Net-worth framing block attached to scenario results so the model can relate
// the answer to the user's total without a special rule.
function netWorthFraming(ctx: ToolContext, m: (usd: number) => string) {
  const nwUsd = currentNetWorthUsd(ctx);
  return { netWorthUsd: nwUsd, currentNetWorth: m(nwUsd) };
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const fmtUnits = (n: number) => (Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(8))));
const pct = (n: number) => `${n.toFixed(1)}%`;

// Defense-in-depth for the "name-less change silently skipped" failure mode.
// applyPortfolioChanges drops any change whose `name` is empty (it keys the asset
// row + dedup on it), so a model that emits only `symbol` would have every row
// skipped and nothing saved. Backfill `name` from `symbol` here before any write;
// the write path still resolves the canonical (Yahoo) name for the stored row.
function backfillChangeNames(changes: unknown[]): void {
  for (const raw of changes) {
    if (!raw || typeof raw !== "object") continue;
    const c = raw as Record<string, unknown>;
    const name = typeof c.name === "string" ? c.name.trim() : "";
    const sym = typeof c.symbol === "string" ? c.symbol.trim() : "";
    if (!name && sym) c.name = sym;
  }
}

// ── Executor ─────────────────────────────────────────────────────────────────
export async function executeAgentTool(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  seed(ctx);
  const m = fmt(ctx);

  switch (name) {
    case "get_net_worth": {
      const r = computeReadout(ctx.currentAssets as unknown as ScenarioAsset[], ctx.usdRates, ctx.now);
      const nw = m(r.netWorthUsd);
      return {
        forModel: { netWorth: nw, topConcentration: r.topSingleNameConcentrationPct != null ? pct(r.topSingleNameConcentrationPct) : null, topSingleName: r.topSingleName, ltv: r.leverage ? pct(r.leverage.ltvPct) : null },
        figures: [nw, ...(r.topSingleNameConcentrationPct != null ? [pct(r.topSingleNameConcentrationPct)] : []), ...(r.leverage ? [pct(r.leverage.ltvPct)] : [])],
      };
    }

    case "get_holdings": {
      const holdings = ctx.currentAssets.map((a) => ({ name: String(a.name), type: String(a.type), value: formatMoney(Number(a.value), String(a.currency || "USD"), ctx.displayCurrency) }));
      return { forModel: { holdings, count: holdings.length }, figures: holdings.map((h) => h.value) };
    }

    case "get_vitals": {
      const r = computeReadout(ctx.currentAssets as unknown as ScenarioAsset[], ctx.usdRates, ctx.now);
      const allocation = r.allocationByCategory.map((s) => ({ category: CATEGORY_LABEL[s.category] ?? s.category, share: pct(s.pct) }));
      return {
        forModel: { netWorth: m(r.netWorthUsd), allocation, singleNameConcentration: r.topSingleNameConcentrationPct != null ? pct(r.topSingleNameConcentrationPct) : null, mortgageLtv: r.leverage ? pct(r.leverage.ltvPct) : null },
        figures: [m(r.netWorthUsd), ...allocation.map((a) => a.share)],
      };
    }

    case "present_scenario":
      return presentTool(input, ctx, m);
    case "future_projection":
      return futureTool(input, ctx, m);
    case "counterfactual":
      return counterfactualTool(input, ctx, m);
    case "hypothetical_buy":
      return hypotheticalBuyTool(input, ctx, m);

    case "resolve_asset": {
      const res = resolveHeldAsset(assetRefs(ctx), str(input.query) ?? "");
      if (res.kind === "resolved") return { forModel: { resolved: res.asset.name } };
      if (res.kind === "ambiguous") return { forModel: { needsClarification: true, options: res.matches.map((a) => a.name) } };
      return { forModel: { needsClarification: true, message: "No held position matches that." } };
    }

    case "resolve_symbol": {
      const res = await resolveMarketSymbol(str(input.hint) ?? "");
      if (res.kind === "resolved") return { forModel: { symbol: res.symbol, label: res.label } };
      if (res.kind === "ambiguous") return { forModel: { needsClarification: true, options: res.candidates.map((c) => c.label) } };
      return { forModel: { needsClarification: true, message: "Couldn't resolve that symbol." } };
    }

    case "propose_mutation":
      return proposeMutationTool(input, ctx);
    case "commit_mutation":
      return commitMutationTool(input, ctx);

    default:
      return { forModel: { error: `Unknown tool: ${name}` } };
  }
}

// ── present_scenario ───────────────────────────────────────────────────────────
async function presentTool(input: Record<string, unknown>, ctx: ToolContext, m: (usd: number) => string): Promise<ToolOutcome> {
  const rawMods = Array.isArray(input.modifications) ? input.modifications : [];
  const gate = await validateScenarioIntent({ kind: "present", modifications: rawMods }, assetRefs(ctx), { displayCurrency: ctx.displayCurrency, usdRates: ctx.usdRates, now: ctx.now });
  if ("clarify" in gate) return { forModel: { needsClarification: true, question: gate.clarify.question, options: gate.clarify.options } };

  const mods = buildPresentMods(rawMods, ctx);
  if (mods.length === 0) return { forModel: { needsClarification: true, question: "Which positions should change, and by how much?" } };

  const { comparison } = await assemblePresent(ctx.supabase, ctx.userId, mods);
  const c = comparison.current, s = comparison.scenario, d = comparison.deltas;
  const nw = m(s.netWorthUsd), delta = m(Math.abs(d.netWorthUsd));
  const conCur = c.topSingleNameConcentrationPct != null ? pct(c.topSingleNameConcentrationPct) : "—";
  const conScn = s.topSingleNameConcentrationPct != null ? pct(s.topSingleNameConcentrationPct) : "—";
  const frame = netWorthFraming(ctx, m);
  return {
    forModel: { scenarioNetWorth: nw, deltaVsNow: `${d.netWorthUsd >= 0 ? "+" : "−"}${delta}`, concentration: { from: conCur, to: conScn }, ...frame },
    figures: [nw, delta, conCur, conScn, frame.currentNetWorth],
    card: { kind: "present", current: c, scenario: s, displayCurrency: ctx.displayCurrency },
  };
}

function buildPresentMods(rawMods: unknown[], ctx: ToolContext): Modification[] {
  const refs = assetRefs(ctx);
  const usdRates = ctx.usdRates;
  const toNative = (displayAmt: number, cur: string): number => {
    const usd = ctx.displayCurrency === "USD" ? displayAmt : displayAmt / (usdRates[ctx.displayCurrency] ?? 1);
    return cur === "USD" ? usd : usd * (usdRates[cur] ?? 1);
  };
  const fullById = new Map(ctx.currentAssets.map((a) => [String(a.id), a]));
  const mods: Modification[] = [];
  for (const raw of rawMods) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const op = o.op;
    if (op === "add") {
      const name = str(o.name); const amount = num(o.amount);
      if (!name || amount == null || amount <= 0) continue;
      const type = str(o.assetType) ?? str(o.type) ?? "etf";
      mods.push({ kind: "addByValue", name, type, currency: ctx.displayCurrency, nativeValue: amount });
      continue;
    }
    if (op === "payMortgage") {
      const amount = num(o.amount);
      if (amount == null || amount <= 0) continue;
      const property = ctx.currentAssets.find((a) => a.type === "real_estate" && Number(a.mortgage_balance ?? 0) > 0);
      if (!property) continue;
      mods.push({ kind: "payDownMortgage", assetId: String(property.id), amount: toNative(amount, String(property.currency || "USD")) });
      // Pick the LARGEST reserve to draw down — compared in USD, not raw native
      // value, or a big number in a weak currency (¥1,000,000 ≈ €6k) wrongly beats
      // a smaller one in a strong currency (€50k) and the scenario sources the
      // paydown from a pot that can't cover it.
      const usdOf = (a: Record<string, unknown>) => {
        const cur = String(a.currency || "USD");
        if (cur === "USD") return Number(a.value);
        const rate = ctx.usdRates[cur];
        return rate ? Number(a.value) / rate : Number(a.value);
      };
      const cash = ctx.currentAssets.filter((a) => a.type === "cash" || a.type === "pension").sort((x, y) => usdOf(y) - usdOf(x))[0];
      if (cash) mods.push({ kind: "setValue", assetId: String(cash.id), nativeValue: Math.max(0, Number(cash.value) - toNative(amount, String(cash.currency || "USD"))) });
      continue;
    }
    const assetQ = str(o.asset);
    if (!assetQ) continue;
    const res = resolveHeldAsset(refs, assetQ);
    if (res.kind !== "resolved") continue;
    const full = fullById.get(res.asset.id);
    if (!full) continue;
    if (op === "remove") mods.push({ kind: "remove", assetId: res.asset.id });
    else if (op === "set") { const v = num(o.value); if (v != null && v >= 0) mods.push({ kind: "setValue", assetId: res.asset.id, nativeValue: toNative(v, String(full.currency || "USD")) }); }
    else if (op === "sell" || op === "reduce") { const amt = num(o.amount); if (amt != null && amt > 0) mods.push({ kind: "setValue", assetId: res.asset.id, nativeValue: Math.max(0, Number(full.value) - toNative(amt, String(full.currency || "USD"))) }); }
  }
  return mods;
}

// ── future_projection ──────────────────────────────────────────────────────────
async function futureTool(input: Record<string, unknown>, ctx: ToolContext, m: (usd: number) => string): Promise<ToolOutcome> {
  const gate = await validateScenarioIntent({ kind: "future", ...input }, assetRefs(ctx), { displayCurrency: ctx.displayCurrency, usdRates: ctx.usdRates, now: ctx.now });
  if ("clarify" in gate) return { forModel: { needsClarification: true, question: gate.clarify.question, options: gate.clarify.options } };

  const toUsdAmt = (a: number) => (ctx.displayCurrency === "USD" ? a : a / (ctx.usdRates[ctx.displayCurrency] ?? 1));
  const body: Record<string, unknown> = { mode: input.mode };
  if (input.mode === "trajectory") {
    if (input.contribution && typeof input.contribution === "object") {
      const c = input.contribution as Record<string, unknown>;
      const amt = num(c.amount);
      if (amt != null && amt > 0) body.contribution = { amount: toUsdAmt(amt), frequency: c.frequency === "yearly" ? "annual" : "monthly" };
    }
    if (num(input.horizonYears) != null) body.horizonYears = input.horizonYears;
  } else {
    if (num(input.target) != null) body.targetUsd = toUsdAmt(input.target as number);
    if (num(input.targetYear) != null) body.date = `${input.targetYear}-12-31`;
    if (str(input.frequency)) body.frequency = input.frequency === "yearly" ? "annual" : "monthly";
  }

  const result = await assembleProject(ctx.supabase, ctx.userId, body);
  if ("error" in result) return { forModel: { needsClarification: true, question: "Over what horizon — and, for a target, by which year?" } };
  const frame = netWorthFraming(ctx, m);

  if (result.mode === "trajectory") {
    const low = m(result.trajectory.low), mid = m(result.trajectory.mid), high = m(result.trajectory.high);
    const rateStr = pct(result.rate * 100), years = `${Math.round(result.horizonYears)}`;
    const { data: snaps } = await ctx.supabase.from("snapshots").select("date, total_value").eq("user_id", ctx.userId).order("date", { ascending: true });
    const rate = dispRate(ctx);
    const horizonDate = new Date(ctx.now); horizonDate.setFullYear(ctx.now.getFullYear() + Math.round(result.horizonYears));
    const card: ScenarioResult = {
      kind: "future",
      cone: {
        history: (snaps ?? []).map((sn) => ({ t: Date.parse(sn.date as string), v: Number(sn.total_value) * rate })),
        today: { t: ctx.now.getTime(), v: result.startUsd * rate },
        horizon: { t: horizonDate.getTime(), low: result.trajectory.low * rate, mid: result.trajectory.mid * rate, high: result.trajectory.high * rate },
        horizonYear: horizonDate.getFullYear(),
        symbol: SYMBOL[ctx.displayCurrency] ?? "€",
      },
    };
    return { forModel: { mode: "trajectory", years, rate: rateStr, projection: { low, mid, high }, estimate: true, ...frame }, figures: [low, mid, high, rateStr, years, frame.currentNetWorth], card };
  }

  if (result.mode !== "solve") return { forModel: { needsClarification: true, question: "What target are you aiming for, and by which year?" } };
  const amt = m(result.solve.amountPerPeriod), target = m(result.targetUsd), year = result.date.slice(0, 4);
  const per = result.solve.frequency === "annual" ? "per year" : "per month";
  return { forModel: { mode: "solve", requiredContribution: `${amt} ${per}`, target, byYear: year, ...frame }, figures: [amt, target, year, frame.currentNetWorth] };
}

// ── counterfactual ─────────────────────────────────────────────────────────────
async function counterfactualTool(input: Record<string, unknown>, ctx: ToolContext, m: (usd: number) => string): Promise<ToolOutcome> {
  const gate = await validateScenarioIntent({ kind: "counterfactual", asset: input.asset }, assetRefs(ctx), { displayCurrency: ctx.displayCurrency, usdRates: ctx.usdRates, now: ctx.now });
  if ("clarify" in gate) return { forModel: { needsClarification: true, question: gate.clarify.question, options: gate.clarify.options } };

  const res = resolveScenarioAsset(assetRefs(ctx), str(input.asset) ?? "");
  if (res.kind !== "resolved") return { forModel: { needsClarification: true, question: "Which held tradeable did you mean?" } };
  const outcome = await assembleCounterfactual(ctx.supabase, ctx.userId, res.asset.id, "All");
  if (!outcome.ok) return { forModel: { error: `Couldn't reconstruct ${res.asset.name}: ${outcome.message}` } };

  const d = outcome.data;
  const amt = m(Math.abs(d.contribution));
  const verb = d.contribution >= 0 ? "added" : "cost";
  const rate = dispRate(ctx);
  const frame = netWorthFraming(ctx, m);
  const card: ScenarioResult = {
    kind: "counterfactual",
    assetName: d.asset.name,
    actual: d.actualSeries.map((p) => ({ t: Date.parse(p.date), v: p.valueUsd * rate })),
    counterfactual: d.counterfactualSeries.map((p) => ({ t: Date.parse(p.date), v: p.valueUsd * rate })),
    symbol: SYMBOL[ctx.displayCurrency] ?? "€",
  };
  return {
    forModel: { asset: d.asset.name, contribution: `${verb} ${amt}`, sign: d.contribution >= 0 ? "gain" : "loss", ...frame },
    figures: [amt, frame.currentNetWorth],
    card,
  };
}

// ── hypothetical_buy ────────────────────────────────────────────────────────────
async function hypotheticalBuyTool(input: Record<string, unknown>, ctx: ToolContext, m: (usd: number) => string): Promise<ToolOutcome> {
  const intent = { kind: "hypothetical_buy", symbolHint: input.symbolHint, buyDateHint: input.dateHint ?? null, units: input.units ?? null, amount: input.amount ?? null, currency: input.currency ?? null };
  const gate = await validateScenarioIntent(intent, assetRefs(ctx), { displayCurrency: ctx.displayCurrency, usdRates: ctx.usdRates, now: ctx.now });
  if ("clarify" in gate) return { forModel: { needsClarification: true, question: gate.clarify.question, options: gate.clarify.options } };
  const parsed = gate.ok;
  const pre = parsed._resolved as { symbol: string; label: string };
  const symbol = pre.symbol, label = pre.label;

  const todayStr = ctx.now.toISOString().slice(0, 10);
  const requestedBuyDate = resolveBuyDate(parsed.buyDateHint, ctx.now);
  const units = num(parsed.units);
  const amountInput = num(parsed.amount);
  const cur = isSupportedCurrency(parsed.currency) ? (parsed.currency as string) : ctx.displayCurrency;
  const toUsdFromCur = (a: number) => (cur === "USD" ? a : a / (ctx.usdRates[cur] ?? 1));

  let priceRaw, fxSeries;
  try {
    [priceRaw, fxSeries] = await Promise.all([fetchHistoricalSeries(symbol, requestedBuyDate, todayStr), getHistoricalUsdRates(requestedBuyDate, todayStr)]);
  } catch {
    return { forModel: { error: `Couldn't pull a price history for ${label}.` } };
  }
  if (!priceRaw || priceRaw.length < 2) return { forModel: { error: `Couldn't pull a price history for ${label}.` } };

  const priceSeries: PricePoint[] = priceRaw.map((p) => ({ date: p.date, price: p.price, currency: p.currency }));
  const earliest = priceSeries[0].date;
  const clamped = requestedBuyDate < earliest;
  const effectiveBuy = clamped ? earliest : requestedBuyDate;

  let amountUsd: number;
  if (units != null) {
    const bp = buyPriceUsd(priceSeries, fxSeries, effectiveBuy);
    if (!bp) return { forModel: { error: `Couldn't pull a price for ${label} around then.` } };
    amountUsd = units * bp.priceUsd;
  } else {
    amountUsd = toUsdFromCur(amountInput ?? 10_000);
  }

  const r = hypotheticalBuyGrowth(amountUsd, effectiveBuy, priceSeries, fxSeries);
  if (r.series.length < 2) return { forModel: { error: `Couldn't pull enough price history for ${label}.` } };

  const unitsStr = units != null ? fmtUnits(units) : null;
  const moneyLabel = m(amountUsd), valueLabel = m(r.valueTodayUsd), gainLabel = m(Math.abs(r.gainUsd));
  const multStr = `${r.multiple.toFixed(1)}x`;
  const buyLabel = r.buyDateUsed;
  const cardLabel = unitsStr != null ? `${unitsStr} ${label}` : `${moneyLabel} in ${label}`;

  const nwUsd = currentNetWorthUsd(ctx);
  const vsNw = nwUsd > 0 ? (r.valueTodayUsd / nwUsd) * 100 : 0;
  const vsNwStr = pct(vsNw);
  const exceedsNetWorth = r.valueTodayUsd > nwUsd && nwUsd > 0;

  const card: ScenarioResult = {
    kind: "hypothetical_buy",
    assetLabel: label,
    buyDate: r.buyDateUsed,
    amountLabel: cardLabel,
    series: r.series.map((p) => ({ t: Date.parse(p.date), v: p.valueUsd * dispRate(ctx) })),
    symbol: SYMBOL[ctx.displayCurrency] ?? "€",
  };
  return {
    forModel: {
      input: unitsStr != null ? `${unitsStr} ${label}` : `${moneyLabel} in ${label}`,
      buyDate: buyLabel,
      clampedToEarliest: clamped,
      valueToday: valueLabel,
      gain: `${r.gainUsd >= 0 ? "+" : "−"}${gainLabel}`,
      multiple: multStr,
      currentNetWorth: m(nwUsd),
      valueVsNetWorth: vsNwStr,
      exceedsNetWorth,
      standaloneGrowth: true,
    },
    figures: [moneyLabel, valueLabel, gainLabel, multStr, `${r.multiple.toFixed(1)}`, `${Math.round(r.multiple)}`, m(nwUsd), vsNwStr, ...(unitsStr != null ? [unitsStr] : [])],
    card,
  };
}

// Real-estate geocode gate — reuses the tag path's geocodeAddress + hasHouseNumber
// rule verbatim. For any add/edit change carrying an address on a real-estate
// position, resolve to a canonical address + lat/long; reject (ask) when there is
// no result or no house number. Returns a copy of changes with geo attached. A
// real-estate change with no address is left untouched (matches the tag path,
// which only geocodes when an address is present).
async function resolveRealEstateGeo(
  changes: unknown[],
  currentAssets: Array<Record<string, unknown>>,
): Promise<{ ok: true; changes: Record<string, unknown>[]; resolved: string[] } | { ok: false; message: string }> {
  const out: Record<string, unknown>[] = [];
  const resolved: string[] = [];
  for (const raw of changes) {
    const ch: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
    const address = typeof ch.address === "string" ? ch.address.trim() : "";
    if (address) {
      const name = String(ch.name ?? "").toLowerCase();
      const existingForEdit = ch.action === "edit"
        ? currentAssets.find((a) => String(a.name).toLowerCase() === name || (a.symbol && String(a.symbol).toLowerCase() === name))
        : null;
      const isRealEstate = ch.type === "real_estate" || (ch.action === "edit" && existingForEdit?.type === "real_estate");
      if (isRealEstate) {
        const countryHint = (ch.country as string | null) ?? (existingForEdit?.country as string | null) ?? null;
        const geo = await geocodeAddress(address, countryHint);
        // Parcels (land, plots, garages, parking, agricultural) geocode only to
        // street/area level — they have no house number — so the house-number
        // rule that keeps a normal home add honest would otherwise make a
        // legitimate mortgaged plot impossible to save (the schema advertises
        // property_type "land"). For those, accept a result that resolved to
        // real coordinates even without a house number; still reject a total miss.
        const propertyType = String(
          (ch.property_type as string | null) ?? (existingForEdit?.property_type as string | null) ?? ""
        ).toLowerCase();
        const isParcel = /\b(land|plot|parcel|kavel|grond|garage|parking|allotment|agricultural)\b/.test(propertyType);
        if (!geo || (!geo.hasHouseNumber && !isParcel)) {
          return { ok: false, message: `I couldn't find "${address}" — could you double-check the spelling or share a postcode?` };
        }
        ch.address = geo.canonicalAddress;
        ch.latitude = geo.latitude;
        ch.longitude = geo.longitude;
        resolved.push(geo.canonicalAddress);
      }
    }
    out.push(ch);
  }
  return { ok: true, changes: out, resolved };
}

// ── propose_mutation (no write) ─────────────────────────────────────────────────
async function proposeMutationTool(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const changes = Array.isArray(input.changes) ? input.changes : [];
  if (changes.length === 0) return { forModel: { error: "No changes to propose." } };
  backfillChangeNames(changes);

  // Geocode real-estate addresses up front so the proposal surfaces the canonical
  // address for confirmation; ask naturally on an unresolvable address (no write).
  const geo = await resolveRealEstateGeo(changes, ctx.currentAssets);
  if (!geo.ok) return { forModel: { needsClarification: true, message: geo.message } };

  const light: CurrentAssetLight[] = ctx.currentAssets.map((a) => ({
    name: String(a.name), symbol: (a.symbol as string | null) ?? null, type: String(a.type),
    value: Number(a.value), currency: String(a.currency || "USD"), units: (a.units as number | null) ?? null,
  }));
  const lines: string[] = [];
  try {
    for (const ch of geo.changes) {
      lines.push(await resolveProposal(ch as ProposalChange, light));
    }
  } catch (err) {
    // An intake gate (pension / real-estate) or a value-mode resolution refused
    // to produce a commit-able proposal because required data is missing. Surface
    // its exact question so the model asks the user for precisely what's needed —
    // never a generic "that failed", and never a write.
    if (err instanceof ValueModeError) {
      return { forModel: { needsClarification: true, message: err.message } };
    }
    throw err;
  }
  const addrLines = geo.resolved.map((a) => `Resolved address: ${a}`);
  const resolvedText = `Resolved:\n${[...lines, ...addrLines].join("\n")}`;
  const chips = ["Confirm and save", "No, let me correct it"];
  return {
    forModel: { proposed: lines, ...(geo.resolved.length ? { resolvedAddresses: geo.resolved } : {}), awaitingConfirmation: true },
    proposal: { resolvedText, chips },
  };
}

// ── commit_mutation (the proven write path) ─────────────────────────────────────
async function commitMutationTool(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const rawChanges = Array.isArray(input.changes) ? input.changes : [];
  if (rawChanges.length === 0) return { forModel: { error: "No changes to commit." } };
  backfillChangeNames(rawChanges);

  // Re-run the geocode gate deterministically: a real-estate add/edit with an
  // address must resolve to a canonical address + coords before any write. If it
  // doesn't resolve, ask — never write a property without resolved geo.
  const geo = await resolveRealEstateGeo(rawChanges, ctx.currentAssets);
  if (!geo.ok) return { forModel: { needsClarification: true, message: geo.message } };
  const changes = geo.changes;

  // Irreversible-delete guard (mirrors the tag path in /api/chat): a bare
  // removal_reason "mistake" HARD-deletes the asset AND all its history,
  // unrecoverable. The agent loop carries no per-turn confirmation signal, so
  // downgrade it to "sold" (a recoverable soft-delete) — the agent can never
  // erase history on its own; a genuine mistake-delete needs an explicit path.
  for (const change of changes) {
    if (change.action === "remove" && change.removal_reason === "mistake") {
      change.removal_reason = "sold";
    }
  }

  // Auto-fill cost basis: an "add" for a tradeable with a stated acquisition
  // month/date but no stated price gets its buy_price filled from Yahoo's
  // closing price for that month — silently. Never surfaced to the user (no
  // "cost basis" annotation): this is a tracking app, not a tax tool, and the
  // basis is not something the user was asked about. Only fires when the model
  // didn't already capture a price; a fetch failure leaves buy_price unset.
  for (const change of changes) {
    if (change.action !== "add") continue;
    if (!TRADEABLE_TYPES.has(String(change.type ?? ""))) continue;
    const symbol = typeof change.symbol === "string" ? change.symbol : null;
    if (!symbol) continue;
    if (typeof change.buy_price === "number" && change.buy_price > 0) continue;
    const buyDateRaw = typeof change.buy_date === "string" ? change.buy_date : null;
    if (!buyDateRaw) continue;
    const resolvedDate = parseAcquisitionMonth(buyDateRaw);
    if (!resolvedDate) continue;

    const lookupSymbol = normalizeCryptoSymbol(symbol, change.type as string | undefined);
    try {
      const monthClose = await getMonthClosingPrice(lookupSymbol, resolvedDate.slice(0, 7));
      if (monthClose && monthClose.price > 0) {
        change.buy_price = Math.round(monthClose.price * 100) / 100;
        change.buy_price_source = "market";
      }
    } catch {
      // Leave buy_price unset — the add proceeds without a cost basis.
    }
  }

  const validationError = validatePortfolioChanges(changes as never, ctx.currentAssets as never);
  if (validationError) return { forModel: { error: validationError } };


  const hasAdds = changes.some((c) => c.action === "add");
  // "first_asset_added" is the time-to-first-asset conversion metric — it must
  // fire ONLY on the genuine first add (an empty portfolio), like the tag path
  // gates it on isNewUser. Captured BEFORE the post-commit refresh below, which
  // would otherwise always show ≥1 asset. Every later add emitted it too,
  // polluting the metric.
  const portfolioWasEmpty = ctx.currentAssets.length === 0;

  // applyPortfolioChanges resolves every date and writes every mutation, so it
  // is the single source of truth for which historical rows changed. It returns
  // `rebuildFrom` (earliest affected date, or null) — no caller-side re-derivation.
  // A single-row commit rethrows a ValueModeError (an unmet intake gate — e.g. a
  // property add missing its mortgage decision, or a value-mode miss). Catch it
  // and hand the model the exact question as needsClarification, so it asks the
  // user for what's missing instead of reporting an opaque failure.
  let commitResult;
  try {
    commitResult = await applyPortfolioChanges({
      supabase: ctx.supabase,
      userId: ctx.userId,
      changes: changes as never,
      currentAssets: ctx.currentAssets as never,
      contextNote: str(input.contextNote),
      proposalTimestamp: null,
      // Feeds the venue auto-resolution: a bare ETF ticker resolves to the
      // listing matching the user's currency (EUR → Xetra, GBP → London).
      displayCurrency: ctx.displayCurrency,
    });
  } catch (err) {
    if (err instanceof ValueModeError) {
      return { forModel: { needsClarification: true, message: err.message } };
    }
    throw err;
  }
  const { changed, duplicateWarnings, fxWarnings, mutationMetas, failures, rebuildFrom } = commitResult;

  // A change landed → refresh the in-context portfolio so any follow-up read in
  // THIS same turn (get_holdings / get_net_worth / get_vitals, or the model
  // verifying the write took) sees the new state, not the pre-commit snapshot.
  // Without this the model's own "did it save?" check reads stale assets and
  // wrongly concludes the write failed — then a retry re-commits the same rows,
  // which now collide as duplicates, cementing a false "commit isn't succeeding".
  if (changed) {
    const { data: refreshed } = await ctx.supabase
      .from("assets").select("*").eq("user_id", ctx.userId).is("removed_at", null);
    if (refreshed) ctx.currentAssets = refreshed;
  }

  // Silent-skip backstop: nothing written, yet no failures AND no duplicates — the
  // rows were structurally dropped by the write path (the classic cause: a change
  // with an empty `name`, now backfilled above). This must never again surface to
  // the model as a vague "write path failing, payload valid" with no signal.
  // Capture it, and hand the model an explicit, actionable note instead of a bare
  // committed:false it can only guess at.
  const nothingLanded = !changed && duplicateWarnings.length === 0 && failures.length === 0;
  if (nothingLanded && hasAdds) {
    Sentry.captureMessage("agent commit wrote nothing with no failures or duplicates — rows skipped", "warning");
  }

  // Distinct signals so the model narrates truthfully rather than reading every
  // non-success the same way: `committed` is whether anything was written;
  // `alreadyInPortfolio` are positions that EXIST (reassure — not an error, do
  // not retry); `couldNotRecord` carries the specific reason per failed row so
  // the model states WHY instead of an opaque "try again". f.reason is already a
  // user-facing sentence for the common ValueMode cases.
  return {
    forModel: {
      committed: changed,
      ...(duplicateWarnings.length ? { alreadyInPortfolio: duplicateWarnings } : {}),
      ...(failures.length ? { couldNotRecord: failures.map((f) => (f.reason ? `${f.name} — ${f.reason}` : f.name)) } : {}),
      ...(nothingLanded && hasAdds ? { note: "Nothing was written and there were no per-row errors — the change rows were malformed (each add needs a non-empty name and a symbol). Rebuild the rows with an explicit name on each and commit once more." } : {}),
      ...(fxWarnings.length ? { notes: fxWarnings } : {}),
    },
    commit: { changed, mutationMetas, analyticsEvent: hasAdds && portfolioWasEmpty ? "first_asset_added" : null, needsBackfill: rebuildFrom != null, hasAdds, rebuildFrom },
  };
}
