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
//
// This one object is embedded in BOTH propose_mutation and commit_mutation, so
// every description below is paid twice on every chat call — keep them terse
// (the fuller behavioural rules live once, in AGENT_SYSTEM).
const CHANGE_ITEM_SCHEMA = {
  type: "object",
  description: "One portfolio change. `name` is required and never empty (a listed security's name may equal its ticker).",
  properties: {
    action: { type: "string", enum: ["add", "edit", "remove"] },
    name: { type: "string", description: "REQUIRED, never empty: display name or ticker (e.g. \"Apple\", \"AAPL\", \"Bitcoin\")." },
    new_name: { type: "string", description: "For a rename edit only." },
    type: { type: "string", enum: ["stocks", "etf", "crypto", "gold", "cash", "bonds", "pension", "real_estate", "other"], description: "Use \"stocks\" for a listed equity." },
    symbol: { type: "string", description: "Market ticker (e.g. AAPL, BTC, VWCE.DE)." },
    units: { type: "number", description: "Quantity held (shares / coins / oz)." },
    value: { type: "number", description: "Current monetary value (value-mode add or set). For real_estate, current market value." },
    currency: { type: "string", enum: ["EUR", "USD", "GBP"] },
    buy_price: { type: "number", description: "Purchase price. For real_estate, price paid at acquisition." },
    buy_date: { type: "string", description: "Acquisition date/month/year or relative phrase; omit if unknown." },
    removal_reason: { type: "string", enum: ["sold", "mistake"] },
    correction: { type: "boolean", description: "TRUE when fixing wrongly-entered data (typo, duplicate, wrong figure/date) rather than recording a real event — fixed silently, no journal entry, history redrawn. On an edit pass the corrected ABSOLUTE figure. A never-owned entry is a remove with removal_reason \"mistake\"." },
    address: { type: "string", description: "Street address (real-estate add/edit)." },
    country: { type: "string" },
    // ── Real-estate / mortgage ──
    mortgage_balance: { type: "number", description: "real_estate add: REQUIRED — outstanding balance in the property's currency; 0 ONLY when confirmed owned free and clear. Never omit (omitted records as owned outright)." },
    mortgage_rate: { type: "number", description: "Annual mortgage rate in % (0 if interest-free). REQUIRED when mortgage_balance > 0. Also reused as a DC pension pot's growth assumption." },
    monthly_payment: { type: "number", description: "Monthly mortgage payment. REQUIRED when mortgage_balance > 0." },
    mortgage_type: { type: "string", enum: ["annuity", "linear", "interest_only"], description: "REQUIRED when mortgage_balance > 0." },
    mortgage_start_date: { type: "string", description: "Mortgage start (year, year-month, or date)." },
    mortgage_end_date: { type: "string", description: "Mortgage payoff date; capture it for interest_only." },
    property_type: { type: "string", description: "e.g. apartment, house, land." },
    size_sqm: { type: "number", description: "Floor area in m²." },
    // ── Pension ──
    pension_kind: { type: "string", enum: ["dc", "db", "state"], description: "dc = owned pot, db = defined-benefit income, state = State pension income." },
    annual_income: { type: "number", description: "db/state pension: annual income it pays." },
    monthly_contribution: { type: "number", description: "dc pot: monthly amount paid in." },
    access_age: { type: "integer", description: "Age the pension unlocks." },
    pension_provider: { type: "string", description: "Provider or scheme name." },
    // ── Bond ──
    coupon_rate: { type: "number", description: "Annual coupon %." },
    maturity_date: { type: "string", description: "Maturity date." },
    issuer: { type: "string", description: "Issuer." },
    isin: { type: "string", description: "ISIN." },
  },
  required: ["action", "name"],
};

// ── Tool schemas (given to Claude) ─────────────────────────────────────────────
export const AGENT_TOOLS: Anthropic.Messages.Tool[] = [
  { name: "get_net_worth", description: "The user's current net worth and top-line vitals. Use before relating any figure to their net worth.", input_schema: { type: "object", properties: {} } },
  { name: "get_holdings", description: "List current holdings with per-position detail (name, type, value, symbol, units, acquisition date, cost basis, gain). Use for what/how much they hold, when they bought, what they paid, and per-position performance.", input_schema: { type: "object", properties: {} } },
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
    description: "Resolve a portfolio change (add/edit/remove) into a confirmable proposal — does NOT write; surfaces confirm chips. Call before committing any stated completed action.",
    input_schema: { type: "object", properties: { changes: { type: "array", items: CHANGE_ITEM_SCHEMA } }, required: ["changes"] },
  },
  {
    name: "commit_mutation",
    description: "Apply portfolio changes to the database (a change with an empty `name` is dropped). ONLY call after explicit user confirmation of a prior propose_mutation — except a direct tradeable add / file import, which commits without a proposal.",
    input_schema: { type: "object", properties: { changes: { type: "array", items: CHANGE_ITEM_SCHEMA }, contextNote: { type: "string" } }, required: ["changes"] },
  },
  {
    name: "set_import_acquisition_date",
    description: "After a file import, stamp the user's ONE batch acquisition-date answer (verbatim — year, month-year, date, relative phrase, or \"just track from now\") onto every imported position still lacking a date. Call exactly once; never issue per-position edits for this. Returns how many were dated — narrate from that.",
    input_schema: { type: "object", properties: { date: { type: "string", description: "The user's acquisition-date answer, verbatim." } }, required: ["date"] },
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
  // Only the formatted string is narrated; the raw USD float was dead weight in
  // every scenario tool_result (and a stray unformatted/USD number the model
  // could echo for a EUR/GBP user). No consumer reads frame.netWorthUsd.
  return { currentNetWorth: m(nwUsd) };
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
      // Full per-position detail, not just name/type/value: the model was
      // previously handed only three fields, so it couldn't answer "how many
      // shares", "when did I buy", "what did I pay", or "how has it done" — even
      // though every one of those is on the loaded asset row. Surface units,
      // ticker, acquisition date, cost basis and gain here so it actually knows
      // the portfolio it's talking about.
      const disp = ctx.displayCurrency;
      const figures: string[] = [];
      const holdings = ctx.currentAssets.map((a) => {
        const cur = String(a.currency || "USD");
        const valueNative = Number(a.value) || 0;
        const units = typeof a.units === "number" && a.units > 0 ? a.units : null;
        const buyPrice = typeof a.buy_price === "number" && a.buy_price > 0 ? a.buy_price : null;
        // Cost basis = buy_price × units (native), only for a tradeable lot where
        // both are known. Gain is current stored value minus that basis.
        const costNative = buyPrice != null && units != null ? buyPrice * units : null;
        const gainNative = costNative != null ? valueNative - costNative : null;
        const gainPct = costNative != null && costNative > 0 ? (gainNative! / costNative) * 100 : null;

        const valueStr = formatMoney(valueNative, cur, disp);
        figures.push(valueStr);
        const h: Record<string, unknown> = { name: String(a.name), type: String(a.type), value: valueStr };
        if (a.symbol) h.symbol = String(a.symbol);
        if (units != null) h.units = fmtUnits(units);
        if (a.buy_date) h.acquired = String(a.buy_date).slice(0, 10);
        if (costNative != null) {
          const costStr = formatMoney(costNative, cur, disp);
          h.costBasis = costStr;
          figures.push(costStr);
        }
        if (gainNative != null) {
          // Push the UNSIGNED amount to the allowlist — the narration guardrail
          // extracts "€1,234" from the model's prose whether it wrote "+€1,234",
          // "up €1,234" or "€1,234", so the signed display form would never match.
          const gainAbs = formatMoney(Math.abs(gainNative), cur, disp);
          h.gain = `${gainNative >= 0 ? "+" : "−"}${gainAbs}`;
          figures.push(gainAbs);
        }
        if (gainPct != null) {
          const gp = pct(gainPct);
          h.gainPct = gp;
          figures.push(gp);
        }
        return h;
      });
      return { forModel: { holdings, count: holdings.length }, figures };
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
    case "set_import_acquisition_date":
      return setImportAcquisitionDateTool(input, ctx);

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

  // Irreversible-delete guard (mirrors the tag path in /api/chat): a
  // mistake/correction remove HARD-deletes the asset AND all its history,
  // unrecoverable. The agent loop carries no per-turn confirmation signal, so
  // downgrade it to "sold" (a recoverable soft-delete) and strip the correction
  // flag — the agent can never erase history on its own; a genuine
  // mistake-delete needs an explicit path. (An edit correction only rewrites the
  // asset's own figure in place and stays reversible, so it is left intact.)
  for (const change of changes) {
    if (change.action === "remove" && (change.removal_reason === "mistake" || change.correction)) {
      change.removal_reason = "sold";
      change.correction = false;
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
  // Batch import still needs a date: a multi-row add committed with no acquisition
  // date leaves those positions dated today until the user gives the batch date.
  // Surface an explicit, in-context signal (the model's own tool memory is stripped
  // from later turns) so on the date reply it calls set_import_acquisition_date
  // instead of hallucinating that the positions are "already dated". Gated at ≥2 so
  // a single tracked-from-now add doesn't get re-prompted.
  const undatedImportCount = changes.filter((c) => c.action === "add" && !c.buy_date).length;

  return {
    forModel: {
      committed: changed,
      ...(duplicateWarnings.length ? { alreadyInPortfolio: duplicateWarnings } : {}),
      ...(failures.length ? { couldNotRecord: failures.map((f) => (f.reason ? `${f.name} — ${f.reason}` : f.name)) } : {}),
      ...(nothingLanded && hasAdds ? { note: "Nothing was written and there were no per-row errors — the change rows were malformed (each add needs a non-empty name and a symbol). Rebuild the rows with an explicit name on each and commit once more." } : {}),
      ...(changed && undatedImportCount >= 2 ? { awaitingAcquisitionDate: undatedImportCount, acquisitionDateHint: "These positions have no acquisition date yet and are currently dated today. Ask the user once for the batch's acquisition date, then call set_import_acquisition_date with their answer." } : {}),
      ...(fxWarnings.length ? { notes: fxWarnings } : {}),
    },
    commit: { changed, mutationMetas, analyticsEvent: hasAdds && portfolioWasEmpty ? "first_asset_added" : null, needsBackfill: rebuildFrom != null, hasAdds, rebuildFrom },
  };
}

// ── set_import_acquisition_date (deterministic batch date-fill) ──────────────────
// The import flow commits positions FIRST (dated today, since the acquisition date
// isn't known yet), then asks the user for the batch date. Applying that date used
// to rely on the model issuing a correct per-position EDIT for every row — a
// skippable, error-prone second write that (per the audit) silently lost the date
// whenever the model narrated completion without a tool call, echoed units on the
// edit, re-added instead of editing, or hit a crypto-name mismatch. This tool
// replaces that with ONE deterministic server-side operation: resolve the phrase
// once, stamp every still-undated holding's buy_date, and back-stamp each original
// "add" mutation's occurred_at (what the Journal and net-worth history key off), so
// the whole class of failures disappears. It is idempotent (targets only undated
// rows) and needs no migration.
async function setImportAcquisitionDateTool(input: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome> {
  const raw = str(input.date);
  if (!raw) {
    return { forModel: { needsClarification: true, message: "What acquisition date should I use? A rough month or year is fine, or 'just track from now'." } };
  }

  // Three-state parse: an ISO date to apply, null for track-from-now (leave undated
  // — that IS the recorded choice), or undefined for a phrase we couldn't read.
  const parsed = parseAcquisitionMonth(raw);
  if (parsed === undefined) {
    return { forModel: { needsClarification: true, message: "I couldn't read that as a date — a year, a month and year, a phrase like '2 years ago', or 'just track from now' all work." } };
  }
  if (parsed === null) {
    return { forModel: { trackFromNow: true, dated: 0 } };
  }

  // Every holding that still has no acquisition date — in the import flow these are
  // exactly the just-committed rows. Bulk-update in two queries (all share the same
  // resolved date), not a per-row fan-out.
  const { data: undated, error: selErr } = await ctx.supabase
    .from("assets")
    .select("id, symbol, type")
    .eq("user_id", ctx.userId)
    .is("removed_at", null)
    .is("buy_date", null);
  if (selErr) {
    Sentry.captureException(selErr, { tags: { tool: "set_import_acquisition_date" } });
    return { forModel: { error: "Couldn't apply the date just now — try again in a moment." } };
  }
  const rows = undated ?? [];
  if (rows.length === 0) {
    return { forModel: { dated: 0, note: "Every position already has an acquisition date." } };
  }
  const ids = rows.map((r) => String(r.id));

  await ctx.supabase.from("assets").update({ buy_date: parsed }).eq("user_id", ctx.userId).in("id", ids);
  // Back-stamp each position's original acquisition ("add") mutation so the Journal
  // entry and the net-worth history read the real acquisition date, not the import
  // day. Returns the updated rows so the market-context background job can refresh
  // them at the corrected date.
  const { data: updatedMuts } = await ctx.supabase
    .from("mutations")
    .update({ occurred_at: parsed })
    .eq("user_id", ctx.userId)
    .eq("action", "add")
    .in("asset_id", ids)
    .select("id, symbol, asset_type");
  const mutationMetas: MutationMeta[] = (updatedMuts ?? []).map((mm) => ({
    id: String(mm.id),
    symbol: (mm.symbol as string | null) ?? null,
    occurredAt: parsed,
    assetType: (mm.asset_type as string | null) ?? null,
  }));

  return {
    forModel: { dated: rows.length, date: parsed },
    // rebuildFrom = the resolved date → the agent loop's backfill redraws the
    // net-worth history from acquisition forward. Not adds, so no first-asset metric.
    commit: { changed: true, mutationMetas, analyticsEvent: null, needsBackfill: true, hasAdds: false, rebuildFrom: parsed },
  };
}
