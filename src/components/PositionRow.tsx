"use client";

import Link from "next/link";
import { fmt, pctChange } from "@/lib/utils";
import { MiniSparkline } from "@/components/MiniSparkline";
import { usePriceHistory } from "@/lib/hooks";
import type { LiveAsset } from "@/lib/supabase";

function monogram(asset: LiveAsset): string {
  if (asset.symbol) {
    return asset.symbol
      .replace(/-[A-Z]+$/i, "")
      .slice(0, 4)
      .toUpperCase();
  }
  return asset.name.slice(0, 3).toUpperCase();
}

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

  return (
    <Link href={`/asset/${asset.id}`} className="block">
      <div className="flex items-center py-3.5 border-b border-border last:border-0 gap-3">
        {/* Monogram icon */}
        <div
          className="bg-surface border border-border flex items-center justify-center shrink-0 font-mono font-medium text-dim"
          style={{ width: 38, height: 38, borderRadius: 11, fontSize: 11 }}
        >
          {monogram(asset)}
        </div>

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
          <div className="font-mono text-[13px] font-medium text-fg">{fmt(asset.value, "EUR")}</div>
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
