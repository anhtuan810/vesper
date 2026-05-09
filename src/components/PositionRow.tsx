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
      <div className="flex items-center py-3.5 border-b border-border last:border-0 gap-3">
        <AssetLogo
          type={asset.type}
          symbol={asset.symbol ?? null}
          name={asset.name}
          property_type={asset.type === "real_estate" ? (asset as RealEstateAsset).property_type ?? null : null}
          size={38}
        />

        {/* Name + sub-line */}
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium text-fg leading-snug truncate">
            {asset.name}
          </div>
          {sub && (
            <div
              className="font-mono text-dim mt-0.5 truncate"
              style={{ fontSize: 10, letterSpacing: "0.04em" }}
            >
              {sub}
            </div>
          )}
        </div>

        {/* Sparkline */}
        <MiniSparkline prices={closes} />

        {/* Value + change */}
        <div className="text-right shrink-0">
          <div className="font-mono text-[13px] font-medium text-fg">{formatMoney(asset.value, displayCurrency)}</div>
          {chg !== null ? (
            <div
              className={`font-mono mt-0.5 ${up ? "text-positive" : "text-negative"}`}
              style={{ fontSize: 10 }}
            >
              {up ? "+" : ""}
              {chg.toFixed(2)}%
            </div>
          ) : (
            <div className="font-mono text-faint mt-0.5" style={{ fontSize: 10 }}>
              —
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
