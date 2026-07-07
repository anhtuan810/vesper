import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// Desktop-only full journal card for a market swing, with the real, auto-computed
// impact on the user's portfolio. Kind-aware:
//   • "index" — a big market-index day. Rendered by DesktopDiary when the swing is
//     `expanded`; smaller ones keep the compact DiaryMarketRow.
//   • "asset" — a held asset's own big day. Always rendered as this full card, on
//     a distinct accent ground (`.mktentry.asset`), scoped to the asset: the tag,
//     lead sentence and right-hand total all read about the holding itself.
// Mobile is untouched (it never renders this).
export function DesktopMarketEntry({ move }: { move: DiaryMarketMove }) {
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;
  const pct = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(1).replace(".", ",")}%`;

  const isAsset = move.kind === "asset";
  const headlineUp = move.pct_change >= 0;
  const m = imp.movers;
  const own = m[0]; // for an asset swing, the reordered headline = the asset itself
  const x = Math.abs(move.pct_change).toFixed(1).replace(".", ",");

  // Right-hand total: for an asset swing, the asset's OWN impact (movers[0]); for
  // an index swing, the whole portfolio's day-change.
  const totalVal = isAsset ? own?.impact ?? 0 : imp.total;
  const totalUp = totalVal >= 0;

  // Deterministic narrative built from the real numbers.
  const lead = isAsset
    ? `${move.index_label} ${headlineUp ? "rose" : "fell"} ${x}% on ${formatDate(move.date)} — ${signed(own?.impact ?? 0)} on your position.`
    : `${move.index_label} ${headlineUp ? "rose" : "fell"} ${x}% on ${formatDate(move.date)}.`;
  const body = isAsset
    ? ""
    : m.length === 0
      ? `Your portfolio was flat that day.`
      : `Your portfolio ${imp.total >= 0 ? "gained" : "lost"} about ${money(imp.total)} that day` +
        (m[0] ? ` — led by ${m[0].label} (${signed(m[0].impact)})` : "") +
        (m[1] ? `, with ${m[1].label} ${m[1].impact >= 0 ? "up" : "down"} ${money(m[1].impact)}` : "") + ".";

  return (
    <div className={`mktentry${isAsset ? " asset" : ""}`}>
      <div className="mktentry-l">
        <div className="mktentry-top">
          <span className="mktentry-idx">
            <i className={headlineUp ? "up" : "dn"} />
            {move.index_label} {pct(move.pct_change)}
          </span>
          <span className="mktentry-tag">{isAsset ? "Auto · Your holding" : "Auto · Market"}</span>
        </div>
        <p className="mktentry-narr">{isAsset ? lead : `${lead} ${body}`}</p>
        {m.length > 0 && (
          <div className="mktentry-movers">
            {m.map((h) => {
              const inner = <>{h.label}<b className={h.impact >= 0 ? "up" : "dn"}>{signed(h.impact)}</b></>;
              return h.assetId
                ? <Link className="mktmover mktmover-link" key={h.symbol} href={`/asset?id=${h.assetId}`} title={`Open ${h.label}`}>{inner}</Link>
                : <span className="mktmover" key={h.symbol}>{inner}</span>;
            })}
          </div>
        )}
      </div>
      <div className="mktentry-r">
        <span className={`mktentry-total ${totalUp ? "up" : "dn"}`}>{signed(totalVal)}</span>
        <span className="mktentry-date">{formatDate(move.date)}</span>
      </div>
    </div>
  );
}
