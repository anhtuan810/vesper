"use client";

import { ProjectionChart } from "@/components/scenario/cards/ProjectionChart";
import { CounterfactualChart } from "@/components/scenario/cards/CounterfactualChart";
import { GrowthChart } from "@/components/scenario/cards/GrowthChart";
import { ScenarioComparisonCard } from "@/components/scenario/cards/ScenarioComparisonCard";
import type { ScenarioResult } from "@/lib/scenario/result";

function fmtBuyDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y) return iso;
  return new Date(y, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Inline renderer for a scenario result in the chat thread. Maps the result kind
// to the matching prop-driven card. Rendered after the guarded narration.
export function ScenarioResultCard({ result }: { result: ScenarioResult }) {
  if (result.kind === "future") {
    return (
      <div style={cardShell}>
        <ProjectionChart
          history={result.cone.history}
          today={result.cone.today}
          horizon={result.cone.horizon}
          horizonYear={result.cone.horizonYear}
          symbol={result.cone.symbol}
        />
        <div className="font-serif" style={estimateNote}>
          Estimate, not advice.
        </div>
      </div>
    );
  }

  if (result.kind === "portfolio_change") {
    return (
      <div style={{ marginTop: 12 }}>
        <ScenarioComparisonCard
          current={result.current}
          scenario={result.scenario}
          displayCurrency={result.displayCurrency}
          title="Your portfolio, before → after"
          allocationBar
          contextualVitals={result.contextualVitals}
        />
      </div>
    );
  }

  if (result.kind === "present") {
    const hasLeverage = !!(result.current.leverage && result.scenario.leverage);
    return (
      <div style={{ marginTop: 12 }}>
        <ScenarioComparisonCard
          current={result.current}
          scenario={result.scenario}
          displayCurrency={result.displayCurrency}
          showLtvCallout={hasLeverage}
        />
      </div>
    );
  }

  if (result.kind === "shock") {
    return (
      <div style={{ marginTop: 12 }}>
        <ScenarioComparisonCard
          current={result.current}
          scenario={result.scenario}
          displayCurrency={result.displayCurrency}
          title="Current vs stressed"
          netWorthLabel="Net worth after shock"
          deltaStyle="drop"
          showConcentration={false}
          showLtvCallout
          allocationLabel="Allocation after shock"
          allocationMarginTop={8}
        />
      </div>
    );
  }

  if (result.kind === "hypothetical_buy") {
    return (
      <div style={cardShell}>
        <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 8 }}>
          {result.amountLabel} · {fmtBuyDate(result.buyDate)}
        </div>
        <GrowthChart series={result.series} symbol={result.symbol} />
        <div className="font-serif" style={estimateNote}>
          Estimate, not advice.
        </div>
      </div>
    );
  }

  // counterfactual
  return (
    <div style={cardShell}>
      <CounterfactualChart actual={result.actual} counterfactual={result.counterfactual} symbol={result.symbol} />
      <div style={legendRow}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 2, background: "var(--accent)", display: "inline-block" }} /> Actual
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--text-faint)", display: "inline-block" }} /> Without {result.assetName}
        </span>
      </div>
    </div>
  );
}

const cardShell: React.CSSProperties = {
  marginTop: 12,
  padding: "14px 14px 12px",
  background: "var(--surface)",
  border: "0.5px solid var(--border)",
  borderRadius: 14,
};
const estimateNote: React.CSSProperties = {
  fontStyle: "italic",
  fontSize: 13,
  color: "var(--text-faint)",
  marginTop: 10,
};
const legendRow: React.CSSProperties = {
  display: "flex",
  gap: 16,
  marginTop: 10,
  fontSize: 13,
  color: "var(--text-dim)",
};
