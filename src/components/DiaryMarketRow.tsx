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

// Auto-logged market note (no computed impact) — same soft gold wash as the
// full MobileMarketEntry, so every machine-written diary line shares one
// ground: gold = "Volnar noticed this for you", plain paper = the user's own
// entries. Kept textually quiet (dim/faint ink) since it carries no € figure.
export function DiaryMarketRow({ move }: DiaryMarketRowProps) {
  const positive = move.pct_change >= 0;
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 12px", margin: "6px 0", alignItems: "center", background: "var(--accent-soft)", borderRadius: "var(--radius-md)" }}>
      <div
        aria-hidden
        style={{
          width: 26, height: 26, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", border: "0.5px solid var(--border)",
          background: "var(--surface)",
          fontSize: "var(--fs-meta)", color: "var(--accent-text)",
          fontFamily: "var(--font-ui)",
        }}
      >
        ~
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: "var(--fs-body)", fontFamily: "var(--font-ui)", fontWeight: 500, color: "var(--text-dim)" }}>
          {move.index_label}{" "}
          <span className="tnum" style={{ color: positive ? "var(--positive-text)" : "var(--negative-text)" }}>
            {fmtPct.format(move.pct_change)}%
          </span>
        </span>
        <span className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", whiteSpace: "nowrap", flexShrink: 0 }}>
          {formatDate(move.date)}
        </span>
      </div>
    </div>
  );
}
