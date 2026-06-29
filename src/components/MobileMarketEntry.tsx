import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// Mobile full diary entry for a big market swing, with the real, auto-computed
// impact on the user's portfolio — the phone equivalent of DesktopMarketEntry.
// DiaryTab renders this when a swing is `expanded` (the largest by |impact| in
// its month, above the floor); smaller swings keep the compact DiaryMarketRow.
// Same deterministic narrative as the desktop card, restyled for the phone list.

function ActivityIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }} aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

export function MobileMarketEntry({ move }: { move: DiaryMarketMove }) {
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;

  const indexUp = move.pct_change >= 0;
  const portUp = imp.total >= 0;
  const m = imp.movers;

  // Deterministic narrative built from the real numbers (mirrors DesktopMarketEntry).
  const lead = `${move.index_label} ${indexUp ? "rose" : "fell"} ${Math.abs(move.pct_change).toFixed(1).replace(".", ",")}% on ${formatDate(move.date)}.`;
  const body = m.length === 0
    ? "Your portfolio was flat that day."
    : `Your portfolio ${portUp ? "gained" : "lost"} about ${money(imp.total)} that day` +
      (m[0] ? ` — led by ${m[0].label} (${signed(m[0].impact)})` : "") +
      (m[1] ? `, with ${m[1].label} ${m[1].impact >= 0 ? "up" : "down"} ${money(m[1].impact)}` : "") + ".";

  return (
    <div style={{ display: "flex", gap: 10, padding: "12px 0", borderBottom: "0.5px solid var(--border)", alignItems: "flex-start" }}>
      {/* Market glyph — distinguishes an auto market entry from an asset row. */}
      <div
        aria-hidden
        style={{
          width: 28, height: 28, flexShrink: 0, marginTop: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", border: "1px solid var(--border)",
        }}
      >
        <ActivityIcon color="var(--text-faint)" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Index move (left) · portfolio impact total (right) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: "var(--text)" }}>
            {move.index_label}{" "}
            <span style={{ fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', color: indexUp ? "var(--positive-text)" : "var(--negative-text)" }}>
              {pct(move.pct_change)}
            </span>
          </span>
          <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap", flexShrink: 0, color: portUp ? "var(--positive-text)" : "var(--negative-text)" }}>
            {signed(imp.total)}
          </span>
        </div>

        {/* Auto · Market · date eyebrow */}
        <div style={{ fontSize: 10.5, fontFamily: "var(--mono)", letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--text-faint)", marginTop: 4 }}>
          Auto · Market · {formatDate(move.date)}
        </div>

        {/* Narrative */}
        <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.5, margin: "8px 0 0" }}>
          {lead} {body}
        </p>

        {/* Movers — tappable to the holding's detail when it's still held */}
        {m.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 9 }}>
            {m.map((h) => {
              const inner = (
                <>
                  {h.label}
                  <b style={{ fontFamily: "var(--mono)", fontWeight: 600, color: h.impact >= 0 ? "var(--positive-text)" : "var(--negative-text)" }}>
                    {signed(h.impact)}
                  </b>
                </>
              );
              const style = {
                display: "inline-flex", alignItems: "center", gap: 5,
                padding: "3px 9px", borderRadius: 999,
                border: "0.5px solid var(--border)", background: "var(--surface)",
                fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap" as const,
                textDecoration: "none" as const,
              };
              return h.assetId
                ? <Link key={h.symbol} href={`/asset?id=${h.assetId}`} style={style}>{inner}</Link>
                : <span key={h.symbol} style={style}>{inner}</span>;
            })}
          </div>
        )}
      </div>
    </div>
  );
}
