"use client";

interface Props {
  propertyValue: number;
  mortgageBalance: number;
}

export function ValueComposition({ propertyValue, mortgageBalance }: Props) {
  const equity = propertyValue - mortgageBalance;
  const equityPct = propertyValue > 0 ? Math.max(0, Math.min(100, (equity / propertyValue) * 100)) : 100;
  const mortgagePct = 100 - equityPct;

  return (
    <div style={{ display: "flex", width: "100%", height: 8, borderRadius: "var(--radius-pill)", overflow: "hidden", background: "var(--surface-elev)" }}>
      <div style={{ width: `${equityPct}%`, height: "100%", background: "var(--accent)", borderRadius: mortgagePct > 0 ? "var(--radius-pill) 0 0 var(--radius-pill)" : "var(--radius-pill)" }} />
      {mortgagePct > 0 && (
        <div style={{ flex: 1, height: "100%", background: "var(--border-strong)", borderRadius: "0 var(--radius-pill) var(--radius-pill) 0" }} />
      )}
    </div>
  );
}
