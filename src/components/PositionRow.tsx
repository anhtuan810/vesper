"use client";

import Link from "next/link";
import { pctChange } from "@/lib/utils";
import { MiniSparkline } from "@/components/MiniSparkline";
import { AssetLogo } from "@/components/AssetLogo";
import { usePriceHistory, useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { LiveAsset, RealEstateAsset } from "@/lib/supabase";

function subLine(asset: LiveAsset): string {
  const parts: string[] = [];
  if (asset.units) parts.push(`${asset.units.toLocaleString()} units`);
  if (asset.country && asset.type !== "crypto") parts.push(asset.country);
  if (asset.livePrice) {
    parts.push(
      asset.livePrice >= 1000
        ? asset.livePrice.toLocaleString("en", { maximumFractionDigits: 0 })
        : asset.livePrice.toFixed(2)
    );
  }
  return parts.join(" · ");
}

export function PositionRow({ asset, closes: closesProp }: { asset: LiveAsset; closes?: number[] }) {
  const { closes: fetchedCloses } = usePriceHistory(closesProp != null ? null : asset.symbol, "1W");
  const closes = closesProp ?? fetchedCloses;
  const chg = pctChange(asset.livePrice, asset.livePrev);
  const up = chg !== null && chg >= 0;
  const sub = subLine(asset);
  const displayCurrency = useDisplayCurrency();

  return (
    <Link href={`/asset/${asset.id}`} className="block">
      <div className="flex items-center border-b border-border last:border-0 gap-3" style={{ paddingTop: 14, paddingBottom: 14 }}>
        <AssetLogo
          type={asset.type}
          symbol={asset.symbol ?? null}
          name={asset.name}
          property_type={asset.type === "real_estate" ? (asset as RealEstateAsset).property_type ?? null : null}
          size={42}
        />

        {/* Name + sub-line */}
        <div className="flex-1 min-w-0">
          <div className="text-fg leading-snug truncate" style={{ fontSize: 16, fontWeight: 500 }}>
            {asset.name}
          </div>
          {sub && (
            <div className="text-dim mt-0.5 truncate" style={{ fontSize: 13 }}>
              {sub}
            </div>
          )}
        </div>

        {/* Sparkline */}
        <MiniSparkline prices={closes} />

        {/* Value + change */}
        <div className="text-right shrink-0">
          <div className="text-fg" style={{ fontSize: 16, fontWeight: 500, fontFeatureSettings: '"tnum" 1' }}>
            {formatMoney(asset.value, displayCurrency)}
          </div>
          {chg !== null ? (
            <div
              className={`mt-0.5 ${up ? "text-positive-text" : "text-negative-text"}`}
              style={{ fontSize: 13, fontWeight: 500 }}
            >
              {up ? "+" : ""}
              {chg.toFixed(2)}%
            </div>
          ) : (
            <div className="text-faint mt-0.5" style={{ fontSize: 13 }}>
              —
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
