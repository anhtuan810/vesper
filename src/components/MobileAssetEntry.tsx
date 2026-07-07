"use client";

import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { AssetLogo } from "@/components/AssetLogo";
import type { DiaryMarketMove } from "@/lib/diary-market-moves";

// nl-NL percent with an explicit sign, matching DiaryMarketRow's convention.
const fmtPct = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "always",
});

// Mobile diary entry for an ASSET swing — a held asset's OWN big single-day move
// (≥5%). Unlike the collapsible index MobileMarketEntry / DiaryMarketRow (soft
// gold wash), this is a FULL, always-open row on the accent-mix ground with an
// accent rail, so a holding's own headline day reads as visibly distinct from the
// market-wide index swings. It shows the asset's OWN figures: its impact on the
// user's position (movers[0]) and its own % (pct_change), not the index numbers.
export function MobileAssetEntry({ move }: { move: DiaryMarketMove }) {
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;

  const own = imp.movers[0]; // the named asset's own impact + deep-link id
  const up = move.pct_change >= 0;
  const label = move.index_label;
  const x = Math.abs(move.pct_change).toFixed(1).replace(".", ",");
  const line = `${label} ${up ? "rose" : "fell"} ${x}% on ${formatDate(move.date)}.`;

  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        padding: "8px 12px", margin: "6px 0",
        background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
        borderLeft: "3px solid var(--accent)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {/* Asset glyph — tradeables always carry a symbol (monogram fallback). */}
      <div style={{ flexShrink: 0 }}>
        <AssetLogo type={null} symbol={move.index_symbol} name={move.index_label} size={26} />
      </div>

      {/* Headline + Volnar's one deterministic line. */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--fs-body)", fontFamily: "var(--font-ui)", fontWeight: 500,
            color: "var(--text)", lineHeight: "var(--lh-tight)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}
        >
          {own?.assetId ? (
            <Link href={`/asset?id=${own.assetId}`} style={{ color: "var(--text)", textDecoration: "none" }}>{label}</Link>
          ) : label}{" "}
          <span className="tnum" style={{ fontWeight: 500, color: up ? "var(--positive-text)" : "var(--negative-text)" }}>
            {fmtPct.format(move.pct_change)}%
          </span>
        </div>
        <p
          className="font-display"
          style={{
            fontStyle: "italic", fontSize: "var(--fs-caption)", color: "var(--text-dim)",
            lineHeight: "var(--lh-body)", margin: "3px 0 0", fontVariationSettings: "'opsz' 16",
          }}
        >
          {line}
        </p>
      </div>

      {/* The asset's own impact on the position + the date. */}
      <div style={{ flexShrink: 0, textAlign: "right", display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-end" }}>
        {own && (
          <span
            className="tnum"
            style={{
              fontSize: "var(--fs-meta)", fontWeight: 500, whiteSpace: "nowrap",
              color: own.impact >= 0 ? "var(--positive-text)" : "var(--negative-text)",
            }}
          >
            {signed(own.impact)}
          </span>
        )}
        <span className="tnum" style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)", whiteSpace: "nowrap" }}>
          {formatDate(move.date)}
        </span>
      </div>
    </div>
  );
}
