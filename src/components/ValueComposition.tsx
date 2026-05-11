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
    <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--surface-elev)" }}>
      <div style={{ width: `${equityPct}%`, height: "100%", background: "var(--accent)", borderRadius: mortgagePct > 0 ? "999px 0 0 999px" : 999 }} />
      {mortgagePct > 0 && (
        <div style={{ flex: 1, height: "100%", background: "rgba(26, 31, 46, 0.15)", borderRadius: "0 999px 999px 0" }} />
      )}
    </div>
  );
}
