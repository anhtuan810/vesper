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

// A contextual vital surfaced on a portfolio-change card, formatted before->after.
export interface ScenarioVitalDelta {
  key: string;
  label: string;
  before: string; // formatted percentage, nl-NL
  after: string;
  beforeBand: "green" | "amber" | "red";
  afterBand: "green" | "amber" | "red";
  /** True when a higher value is worse (colour the delta accordingly). */
  higherIsWorse: boolean;
}

export type ScenarioResult =
  | { kind: "future"; cone: ConeData }
  // The single whole-portfolio before->after answer for any portfolio-changing what-if.
  | {
      kind: "portfolio_change";
      current: ComparisonData;
      scenario: ComparisonData;
      displayCurrency: DisplayCurrency;
      contextualVitals: ScenarioVitalDelta[];
    }
  | { kind: "present"; current: ComparisonData; scenario: ComparisonData; displayCurrency: DisplayCurrency }
  | { kind: "shock"; current: ComparisonData; scenario: ComparisonData; displayCurrency: DisplayCurrency }
  | {
      kind: "counterfactual";
      assetName: string;
      actual: Array<{ t: number; v: number }>;
      counterfactual: Array<{ t: number; v: number }>;
      symbol: string;
    }
  | {
      kind: "hypothetical_buy";
      assetLabel: string;
      /** Effective buy date (ISO), clamped to earliest data when needed. */
      buyDate: string;
      /** The assumed amount, formatted in the display currency. */
      amountLabel: string;
      /** Standalone investment value from buy date to today, in display numbers. */
      series: Array<{ t: number; v: number }>;
      symbol: string;
    };
