import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// Desktop-only full journal card for a big market swing, with the real,
// auto-computed impact on the user's portfolio. Rendered by DesktopDiary when a
// swing is `expanded`; smaller swings keep the compact DiaryMarketRow. Mobile is
// untouched (it never renders this).
export function DesktopMarketEntry({ move }: { move: DiaryMarketMove }) {
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;

  const indexUp = move.pct_change >= 0;
  const portUp = imp.total >= 0;
  const m = imp.movers;

  // Deterministic narrative built from the real numbers.
  const lead = `${move.index_label} ${indexUp ? "rose" : "fell"} ${Math.abs(move.pct_change).toFixed(1).replace(".", ",")}% on ${formatDate(move.date)}.`;
  const body = m.length === 0
    ? `Your portfolio was flat that day.`
    : `Your portfolio ${portUp ? "gained" : "lost"} about ${money(imp.total)} that day` +
      (m[0] ? ` — led by ${m[0].label} (${signed(m[0].impact)})` : "") +
      (m[1] ? `, with ${m[1].label} ${m[1].impact >= 0 ? "up" : "down"} ${money(m[1].impact)}` : "") + ".";

  return (
    <div className="mktentry">
      <div className="mktentry-l">
        <div className="mktentry-top">
          <span className="mktentry-idx">
            <i className={indexUp ? "up" : "dn"} />
            {move.index_label} {pct(move.pct_change)}
          </span>
          <span className="mktentry-tag">Auto · Market</span>
        </div>
        <p className="mktentry-narr">{lead} {body}</p>
        {m.length > 0 && (
          <div className="mktentry-movers">
            {m.map((h) => (
              <span className="mktmover" key={h.symbol}>
                {h.label}
                <b className={h.impact >= 0 ? "up" : "dn"}>{signed(h.impact)}</b>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="mktentry-r">
        <span className={`mktentry-total ${portUp ? "up" : "dn"}`}>{signed(imp.total)}</span>
        <span className="mktentry-date">{formatDate(move.date)}</span>
      </div>
    </div>
  );
}
