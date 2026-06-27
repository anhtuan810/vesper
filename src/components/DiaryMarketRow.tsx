import { formatDate } from "@/lib/utils";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

const fmtPct = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

interface DiaryMarketRowProps {
  move: DiaryMarketMove;
}

export function DiaryMarketRow({ move }: DiaryMarketRowProps) {
  const positive = move.pct_change >= 0;
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", alignItems: "center", opacity: 0.6 }}>
      <div
        aria-hidden
        style={{
          width: 28, height: 28, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", border: "1px solid var(--border)",
          fontSize: 13, color: "var(--text-faint)",
          fontFamily: "var(--font-sans)",
        }}
      >
        ~
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: "var(--text-dim)" }}>
          {move.index_label}{" "}
          <span style={{ color: positive ? "var(--positive-text)" : "var(--negative-text)", fontFamily: "var(--mono)" }}>
            {fmtPct.format(move.pct_change)}%
          </span>
        </span>
        <span style={{ fontSize: 13, color: "var(--text-faint)", fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap", flexShrink: 0 }}>
          {formatDate(move.date)}
        </span>
      </div>
    </div>
  );
}
