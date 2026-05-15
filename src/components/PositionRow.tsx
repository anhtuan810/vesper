"use client";

import Link from "next/link";
import { pctChange, displayTicker } from "@/lib/utils";
import { MiniSparkline } from "@/components/MiniSparkline";
import { AssetLogo } from "@/components/AssetLogo";
import { usePriceHistory, useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { LiveAsset } from "@/lib/supabase";

const TRADEABLE_TYPES: ReadonlySet<string> = new Set(["stocks", "etf", "crypto", "gold"]);

const fmtPct = new Intl.NumberFormat("nl-NL", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always",
});

function subLine(asset: LiveAsset): string {
  if (asset.type === "real_estate") return asset.country ?? "";

  if (TRADEABLE_TYPES.has(asset.type)) {
    const parts: string[] = [];
    if (asset.symbol) {
      const ticker =
        asset.type === "crypto"
          ? asset.symbol.replace(/-USD$/i, "").replace(/-EUR$/i, "").toUpperCase()
          : displayTicker(asset.symbol).toUpperCase();
      parts.push(ticker);
    }
    if (asset.units != null) {
      const unitLabel =
        asset.type === "stocks" || asset.type === "etf" ? "shares" : "units";
      parts.push(`${asset.units.toLocaleString()} ${unitLabel}`);
    }
    // country intentionally omitted for all tradeables
    return parts.join(" · ");
  }

  // Static positions (cash, pension, bonds, other): no country
  if (asset.units != null) return `${asset.units.toLocaleString()} units`;
  return "";
}

export function PositionRow({ asset, closes: closesProp }: { asset: LiveAsset; closes?: number[] }) {
  const { closes: fetchedCloses } = usePriceHistory(closesProp != null ? null : asset.symbol, "1W");
  const closes = closesProp ?? fetchedCloses;
  const chg = pctChange(asset.livePrice, asset.livePrev);
  const up = chg !== null && chg >= 0;
  const sub = subLine(asset);
  const displayCurrency = useDisplayCurrency();
  const hasSparkline = closes.length >= 2;
  const isTradeable = TRADEABLE_TYPES.has(asset.type);

  return (
    <Link href={`/asset/${asset.id}`} className="block">
      <div
        className="flex items-center border-b border-border-strong last:border-0 gap-3"
        style={{ paddingTop: 12, paddingBottom: 12 }}
      >
        <AssetLogo
          type={asset.type}
          symbol={asset.symbol ?? null}
          name={asset.name}
          size={32}
        />

        {/* Name + sub-line */}
        <div className="flex-1 min-w-0">
          <div className="text-fg leading-snug truncate" style={{ fontSize: 15, fontWeight: 500 }}>
            {asset.name}
          </div>
          {sub && (
            <div className="text-dim mt-0.5 truncate" style={{ fontSize: 11.5 }}>
              {sub}
            </div>
          )}
        </div>

        {hasSparkline && <MiniSparkline prices={closes} />}

        {/* Value + change — paddingRight aligns value right-edge with group total */}
        <div className="text-right shrink-0" style={{ paddingRight: 28 }}>
          <div
            className="text-fg"
            style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}
          >
            {formatMoney(asset.value, displayCurrency)}
          </div>
          {isTradeable && chg !== null && (
            <div
              className={`mt-0.5 ${up ? "text-positive-text" : "text-negative-text"}`}
              style={{ fontSize: 11.5, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}
            >
              {fmtPct.format(chg)}%
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
