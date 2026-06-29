import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// Mobile full diary entry for a big market swing, with the real, auto-computed
// impact on the user's portfolio — the phone equivalent of DesktopMarketEntry.
// DiaryTab renders this when a swing is `expanded` (the largest by |impact| in
// its month, above the floor); smaller swings keep the compact DiaryMarketRow.
//
// Highlighted as an AUTO entry the same way the desktop Journal (.mktentry) and
// the marketing journal do: a soft left-fading reserves-lane wash + a 3px left
// accent stripe + an "Auto · Market" tag, so an entry Volnar logged itself reads
// distinctly from the user's own decisions.

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
    <div
      style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        // No horizontal padding so the glyph sits in the same left column as the
        // asset logos (the diary list is flush to the screen edge), keeping the
        // auto entry aligned with the manual rows. Vertical padding kept tight.
        padding: "8px 0 9px",
        // Auto-entry highlight — soft reserves-lane wash fading right + a 3px left
        // accent stripe, matching the desktop Journal's .mktentry treatment.
        background: "linear-gradient(90deg, var(--cat-reserves-soft), transparent 76%)",
        boxShadow: "inset 3px 0 0 var(--cat-reserves-band)",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {/* Market glyph — distinguishes an auto market entry from an asset row. */}
      <div
        aria-hidden
        style={{
          width: 26, height: 26, flexShrink: 0, marginTop: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%", border: "1px solid var(--cat-reserves-band)",
        }}
      >
        <ActivityIcon color="var(--cat-reserves-band)" />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Index move (left) · portfolio impact total (right) */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: "var(--text)", lineHeight: 1.2 }}>
            {move.index_label}{" "}
            <span style={{ fontFamily: "var(--mono)", fontWeight: 500, fontFeatureSettings: '"tnum" 1', color: indexUp ? "var(--positive-text)" : "var(--negative-text)" }}>
              {pct(move.pct_change)}
            </span>
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 600, fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1', whiteSpace: "nowrap", flexShrink: 0, color: portUp ? "var(--positive-text)" : "var(--negative-text)" }}>
            {signed(imp.total)}
          </span>
        </div>

        {/* Auto · Market tag (left) · date (right) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 5 }}>
          <span
            style={{
              fontFamily: "var(--mono)", fontSize: 9, fontWeight: 700,
              letterSpacing: "0.07em", textTransform: "uppercase",
              color: "var(--cat-reserves-band)", background: "var(--surface)",
              border: "0.5px solid var(--border)", borderRadius: 4, padding: "1.5px 6px",
            }}
          >
            Auto · Market
          </span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--text-faint)", whiteSpace: "nowrap" }}>
            {formatDate(move.date)}
          </span>
        </div>

        {/* Narrative */}
        <p style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.4, margin: "5px 0 0" }}>
          {lead} {body}
        </p>

        {/* Movers — tappable to the holding's detail when it's still held */}
        {m.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 7 }}>
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
                padding: "2px 8px", borderRadius: 999,
                border: "0.5px solid var(--border)", background: "var(--surface)",
                fontSize: 11.5, color: "var(--text-dim)", whiteSpace: "nowrap" as const,
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
