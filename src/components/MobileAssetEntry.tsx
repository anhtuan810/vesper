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
// (≥5%). A single-line row on the accent-mix ground with an accent rail, visibly
// distinct from the market-wide index swings (which use the ~ / activity glyph on
// the gold wash). It shows the asset's OWN figures — its impact on the position
// (movers[0]) and its own % (pct_change). No prose line: the headline "{ASSET}
// {±%}" and the date on the right already say it, so a sentence would just repeat
// them.
export function MobileAssetEntry({ move }: { move: DiaryMarketMove }) {
  const imp = move.impact;
  if (!imp) return null;

  const cur = imp.currency as DisplayCurrency;
  const money = (n: number) => formatMoney(Math.abs(n), cur, cur);
  const signed = (n: number) => `${n >= 0 ? "+" : "−"}${money(n)}`;

  const own = imp.movers[0]; // the named asset's own impact + deep-link id
  const up = move.pct_change >= 0;
  const label = move.index_label;

  return (
    <div
      style={{
        display: "flex", gap: 10, alignItems: "center",
        padding: "8px 12px", margin: "6px 0",
        background: "color-mix(in srgb, var(--accent) 14%, var(--surface))",
        // Accent rail as an inset shadow (not a border) so it doesn't shift the
        // content 3px and misalign the glyph with the index rows above/below.
        boxShadow: "inset 3px 0 0 var(--accent)",
        borderRadius: "var(--radius-md)",
      }}
    >
      {/* Asset glyph — tradeables always carry a symbol (monogram fallback). */}
      <div style={{ flexShrink: 0 }}>
        <AssetLogo type={null} symbol={move.index_symbol} name={move.index_label} size={26} />
      </div>

      {/* Headline · own impact · date — one line, no redundant prose. */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 8 }}>
        <span
          style={{
            flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            fontSize: "var(--fs-body)", fontFamily: "var(--font-ui)", fontWeight: 500,
            color: "var(--text)", lineHeight: "var(--lh-tight)",
          }}
        >
          {own?.assetId ? (
            <Link href={`/asset?id=${own.assetId}`} style={{ color: "var(--text)", textDecoration: "none" }}>{label}</Link>
          ) : label}{" "}
          <span className="tnum" style={{ fontWeight: 500, color: up ? "var(--positive-text)" : "var(--negative-text)" }}>
            {fmtPct.format(move.pct_change)}%
          </span>
        </span>
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
