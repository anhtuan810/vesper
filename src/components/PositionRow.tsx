"use client";

import Link from "next/link";
import { pctChange, displayTicker } from "@/lib/utils";
import { MiniSparkline } from "@/components/MiniSparkline";
import { AssetLogo } from "@/components/AssetLogo";
import { usePriceHistory, useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { LiveAsset } from "@/lib/supabase";
import { venueLabel } from "@/lib/venues";
import { computeCurrentBalance } from "@/lib/mortgage";

const TRADEABLE_TYPES: ReadonlySet<string> = new Set(["stocks", "etf", "crypto", "gold"]);

const fmtPct = new Intl.NumberFormat("en-US", {
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
      if (asset.type !== "crypto" && asset.symbol) {
        const label = venueLabel(asset.symbol);
        if (label) parts.push(label);
      }
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

export function PositionRow({ asset, closes: closesProp, valuesSettled }: { asset: LiveAsset; closes?: number[]; valuesSettled?: boolean }) {
  const { closes: fetchedCloses } = usePriceHistory(closesProp != null ? null : asset.symbol, "1W");
  const closes = closesProp ?? fetchedCloses;
  const chg = pctChange(asset.livePrice, asset.livePrev);
  const up = chg !== null && chg >= 0;
  const sub = subLine(asset);
  const displayCurrency = useDisplayCurrency();
  const hasSparkline = closes.length >= 2;
  const isTradeable = TRADEABLE_TYPES.has(asset.type);
  const isRealEstate = asset.type === "real_estate";
  const mortgageBalance = isRealEstate ? computeCurrentBalance(asset) : 0;
  const displayValue = isRealEstate ? asset.value - mortgageBalance : asset.value;

  // Owned share of the property: equity / gross value, clamped to [0,1]. NaN when
  // there's no usable value (drives the outline-only icon and hides the caption).
  const ownedFraction =
    isRealEstate && asset.value > 0
      ? Math.max(0, Math.min(1, (asset.value - mortgageBalance) / asset.value))
      : NaN;

  return (
    <Link href={`/asset?id=${asset.id}`} className="block">
      <div
        className="flex items-center border-b border-border-strong last:border-0 gap-3"
        style={{ paddingTop: 9, paddingBottom: 9 }}
      >
        <AssetLogo
          type={asset.type}
          symbol={asset.symbol ?? null}
          name={asset.name}
          size={32}
          ownedFraction={isRealEstate ? ownedFraction : undefined}
        />

        {/* Name + sub-line */}
        <div className="flex-1 min-w-0">
          <div className="text-fg leading-snug truncate" style={{ fontSize: 15, fontWeight: 500 }}>
            {asset.name}
          </div>
          {sub && (
            <div className="text-dim mt-0.5 truncate" style={{ fontSize: 12 }}>
              {sub}
            </div>
          )}
        </div>

        {hasSparkline && <MiniSparkline prices={closes} directionUp={chg === null ? undefined : up} />}

        {/* Value + change — flush to the row's right edge, matching the group total */}
        <div className="text-right shrink-0">
          {!valuesSettled ? (
            <div className="bg-surface-elev rounded animate-pulse" style={{ height: 14, width: 64 }} />
          ) : (
            <>
              <div
                className={isTradeable && chg !== null ? (up ? "text-positive-text" : "text-negative-text") : "text-fg"}
                style={{ fontSize: 13, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}
              >
                {formatMoney(displayValue, asset.currency || "USD", displayCurrency)}
              </div>
              {isTradeable && chg !== null && (
                <div
                  className={`mt-0.5 ${up ? "text-positive-text" : "text-negative-text"}`}
                  style={{ fontSize: 12, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}
                >
                  {fmtPct.format(chg)}%
                </div>
              )}
              {isRealEstate && Number.isFinite(ownedFraction) && (
                <div
                  className="mt-0.5 text-dim"
                  style={{ fontSize: 12, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}
                >
                  {ownedFraction >= 1 ? "Owned outright" : `${Math.round(ownedFraction * 100)}% owned`}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </Link>
  );
}
