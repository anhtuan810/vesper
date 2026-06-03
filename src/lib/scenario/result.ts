// Structured scenario-result payload returned by /api/chat alongside the
// guarded narration, and rendered inline in the thread as a card. All chart
// series are pre-converted to display-currency numbers server-side; comparison
// readouts stay in USD and carry their display currency for formatting.

import type { DisplayCurrency } from "@/lib/money";

export interface ConeData {
  history: Array<{ t: number; v: number }>;
  today: { t: number; v: number } | null;
  horizon: { t: number; low: number; mid: number; high: number } | null;
  horizonYear: number;
  symbol: string;
}

export interface ComparisonData {
  netWorthUsd: number;
  allocationByCategory: Array<{ category: string; valueUsd: number; pct: number }>;
  topSingleNameConcentrationPct: number | null;
  leverage: { ltvPct: number } | null;
}

export type ScenarioResult =
  | { kind: "future"; cone: ConeData }
  | { kind: "present"; current: ComparisonData; scenario: ComparisonData; displayCurrency: DisplayCurrency }
  | { kind: "shock"; current: ComparisonData; scenario: ComparisonData; displayCurrency: DisplayCurrency }
  | {
      kind: "counterfactual";
      assetName: string;
      actual: Array<{ t: number; v: number }>;
      counterfactual: Array<{ t: number; v: number }>;
      symbol: string;
    };
