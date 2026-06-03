// Deterministic, present-tense scenario engine.
//
// Pure functions only — no I/O, no fetches, no clock-dependent behavior beyond an
// explicit `asOf` parameter. FX rates are passed IN so the engine is fully
// deterministic and testable. The sandbox is clone-and-modify: real assets,
// mutations, and snapshots are never touched (Decision 8).
//
// Metric definitions mirror the live app so scenario numbers match Vitals/Portfolio:
//   - net worth      → src/lib/snapshot.ts  (equity = value − current mortgage balance; USD bridge)
//   - concentration  → src/lib/vitals/concentration.ts  (investableTopPositionPct)
//   - allocation     → src/components/PortfolioTab.tsx   (CATEGORY_MAP, equity per category)
//   - leverage/LTV   → src/lib/vitals/leverage.ts        (total debt / total property value)

import { computeCurrentBalance, type MortgageAssetInput } from "@/lib/mortgage";

/** Units of `quote` per 1 USD, e.g. { EUR: 0.92 } — same shape as getUsdRates(). */
export type UsdRates = Record<string, number>;

export interface ScenarioAsset {
  id: string;
  name: string;
  type: string;
  value: number;       // native currency
  currency: string;
  mortgage_balance?: number | null;
  mortgage_balance_recorded_at?: string | null;
  mortgage_rate?: number | null;
  monthly_payment?: number | null;
  mortgage_type?: string | null;
}

export type Modification =
  | { kind: "remove"; assetId: string }
  | { kind: "setValue"; assetId: string; nativeValue: number }
  | { kind: "addByValue"; name: string; type: string; currency: string; nativeValue: number }
  | { kind: "payDownMortgage"; assetId: string; amount: number };

// ── USD bridge (mirror of toUsd in src/lib/snapshot.ts / apply-changes.ts) ────
function toUsd(amount: number, currency: string, rates: UsdRates): number {
  if (currency === "USD") return amount;
  const rate = rates[currency];
  return rate ? amount / rate : amount;
}

// Semantic category map — mirror of CATEGORY_MAP in src/components/PortfolioTab.tsx
// (it is component-local there, not a shared export; kept in sync by hand).
const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks: "markets",
  etf: "markets",
  crypto: "crypto",
  cash: "reserves",
  pension: "reserves",
  bonds: "reserves",
  gold: "reserves",
  other: "reserves",
};
const categoryFor = (type: string): string => CATEGORY_MAP[type] ?? "reserves";

/** Public alias of the internal category mapper, for the projection engine. */
export const categoryForType = categoryFor;

// Net-worth contribution in native currency. Mirror of src/lib/snapshot.ts and
// src/components/PortfolioTab.tsx: real estate counts equity (value minus the
// amortized current mortgage balance); every other type counts full value.
function equityNative(a: ScenarioAsset, asOf: Date): number {
  return a.type === "real_estate" ? a.value - computeCurrentBalance(a as MortgageAssetInput, asOf) : a.value;
}

// ── Readout ───────────────────────────────────────────────────────────────────

export interface AllocationSlice {
  category: string;
  valueUsd: number;
  pct: number; // share of net worth
}

export interface Readout {
  netWorthUsd: number;
  allocationByCategory: AllocationSlice[];
  /** Largest investable position as a % of the investable book (non-real-estate). */
  topSingleNameConcentrationPct: number | null;
  topSingleName: string | null;
  /** Present only when the portfolio holds real estate. */
  leverage: { ltvPct: number } | null;
}

export function computeReadout(
  assets: ScenarioAsset[],
  usdRates: UsdRates,
  asOf: Date = new Date(),
): Readout {
  // Net worth + allocation by category, equity basis, on the USD bridge.
  let netWorthUsd = 0;
  const catUsd: Record<string, number> = {};
  for (const a of assets) {
    const eqUsd = toUsd(equityNative(a, asOf), a.currency || "USD", usdRates);
    netWorthUsd += eqUsd;
    const cat = categoryFor(a.type);
    catUsd[cat] = (catUsd[cat] ?? 0) + eqUsd;
  }
  const allocationByCategory: AllocationSlice[] = Object.entries(catUsd)
    .map(([category, valueUsd]) => ({
      category,
      valueUsd,
      pct: netWorthUsd !== 0 ? (valueUsd / netWorthUsd) * 100 : 0,
    }))
    .sort((a, b) => b.valueUsd - a.valueUsd);

  // Single-name concentration — % of the investable (non-real-estate) book.
  // Mirror of vitals/concentration.ts investableTopPositionPct. Computed on the
  // USD bridge; the ratio is currency-neutral (vitals normalizes to one currency).
  const investable = assets
    .filter((a) => a.type !== "real_estate")
    .map((a) => ({ name: a.name, valueUsd: toUsd(a.value, a.currency || "USD", usdRates) }))
    .sort((a, b) => b.valueUsd - a.valueUsd);
  let topSingleNameConcentrationPct: number | null = null;
  let topSingleName: string | null = null;
  if (investable.length > 0) {
    const investableGross = investable.reduce((s, x) => s + x.valueUsd, 0) || 1;
    topSingleNameConcentrationPct = (investable[0].valueUsd / investableGross) * 100;
    topSingleName = investable[0].name;
  }

  // Leverage / LTV — only when real estate is present.
  // Mirror of vitals/leverage.ts: total current debt / total property value.
  const re = assets.filter((a) => a.type === "real_estate");
  let leverage: { ltvPct: number } | null = null;
  if (re.length > 0) {
    const propertyUsd = re.reduce((s, a) => s + toUsd(a.value, a.currency || "USD", usdRates), 0);
    const debtUsd = re.reduce(
      (s, a) => s + toUsd(computeCurrentBalance(a as MortgageAssetInput, asOf), a.currency || "USD", usdRates),
      0,
    );
    leverage = { ltvPct: propertyUsd > 0 ? (debtUsd / propertyUsd) * 100 : 0 };
  }

  return { netWorthUsd, allocationByCategory, topSingleNameConcentrationPct, topSingleName, leverage };
}

// ── Apply modifications (pure — real assets untouched) ──────────────────────────

export function applyModifications(assets: ScenarioAsset[], mods: Modification[]): ScenarioAsset[] {
  // Shallow-copy each asset up front so the caller's array and objects are never mutated.
  let next: ScenarioAsset[] = assets.map((a) => ({ ...a }));
  let addCounter = 0;
  for (const mod of mods) {
    if (mod.kind === "remove") {
      next = next.filter((a) => a.id !== mod.assetId);
    } else if (mod.kind === "setValue") {
      next = next.map((a) => (a.id === mod.assetId ? { ...a, value: mod.nativeValue } : a));
    } else if (mod.kind === "payDownMortgage") {
      // Reduce the current (amortized) mortgage balance by `amount`; re-anchor the
      // recorded date to now so the engine reads the paid-down balance as today's.
      const at = new Date().toISOString();
      next = next.map((a) =>
        a.id === mod.assetId
          ? {
              ...a,
              mortgage_balance: Math.max(0, computeCurrentBalance(a as MortgageAssetInput) - mod.amount),
              mortgage_balance_recorded_at: at,
            }
          : a,
      );
    } else {
      next = [
        ...next,
        {
          id: `scenario-add-${addCounter++}`,
          name: mod.name,
          type: mod.type,
          currency: mod.currency,
          value: mod.nativeValue,
        },
      ];
    }
  }
  return next;
}

// ── Compare ─────────────────────────────────────────────────────────────────

export interface Comparison {
  current: Readout;
  scenario: Readout;
  deltas: {
    netWorthUsd: number;
    topSingleNameConcentrationPct: number | null;
    ltvPct: number | null;
    allocationByCategory: AllocationSlice[]; // scenario − current, per category
  };
}

export function compareScenarios(
  current: ScenarioAsset[],
  scenario: ScenarioAsset[],
  usdRates: UsdRates,
  asOf: Date = new Date(),
): Comparison {
  const c = computeReadout(current, usdRates, asOf);
  const s = computeReadout(scenario, usdRates, asOf);

  const cMap = new Map(c.allocationByCategory.map((x) => [x.category, x]));
  const sMap = new Map(s.allocationByCategory.map((x) => [x.category, x]));
  const categories = new Set([...cMap.keys(), ...sMap.keys()]);
  const allocationByCategory: AllocationSlice[] = [...categories]
    .map((category) => ({
      category,
      valueUsd: (sMap.get(category)?.valueUsd ?? 0) - (cMap.get(category)?.valueUsd ?? 0),
      pct: (sMap.get(category)?.pct ?? 0) - (cMap.get(category)?.pct ?? 0),
    }))
    .sort((a, b) => Math.abs(b.valueUsd) - Math.abs(a.valueUsd));

  const concDelta =
    c.topSingleNameConcentrationPct !== null && s.topSingleNameConcentrationPct !== null
      ? s.topSingleNameConcentrationPct - c.topSingleNameConcentrationPct
      : null;
  const ltvDelta = c.leverage && s.leverage ? s.leverage.ltvPct - c.leverage.ltvPct : null;

  return {
    current: c,
    scenario: s,
    deltas: {
      netWorthUsd: s.netWorthUsd - c.netWorthUsd,
      topSingleNameConcentrationPct: concDelta,
      ltvPct: ltvDelta,
      allocationByCategory,
    },
  };
}

// ── Untrusted-input sanitizer (used by the compute route) ──────────────────────

export function sanitizeModifications(input: unknown): Modification[] {
  if (!Array.isArray(input)) return [];
  const out: Modification[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const m = raw as Record<string, unknown>;
    if (m.kind === "remove" && typeof m.assetId === "string") {
      out.push({ kind: "remove", assetId: m.assetId });
    } else if (
      m.kind === "setValue" &&
      typeof m.assetId === "string" &&
      typeof m.nativeValue === "number" &&
      Number.isFinite(m.nativeValue)
    ) {
      out.push({ kind: "setValue", assetId: m.assetId, nativeValue: m.nativeValue });
    } else if (
      m.kind === "addByValue" &&
      typeof m.name === "string" &&
      typeof m.type === "string" &&
      typeof m.currency === "string" &&
      typeof m.nativeValue === "number" &&
      Number.isFinite(m.nativeValue)
    ) {
      out.push({
        kind: "addByValue",
        name: m.name,
        type: m.type,
        currency: m.currency,
        nativeValue: m.nativeValue,
      });
    } else if (
      m.kind === "payDownMortgage" &&
      typeof m.assetId === "string" &&
      typeof m.amount === "number" &&
      Number.isFinite(m.amount) &&
      m.amount > 0
    ) {
      out.push({ kind: "payDownMortgage", assetId: m.assetId, amount: m.amount });
    }
  }
  return out;
}
