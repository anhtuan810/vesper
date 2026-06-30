"use client";

import { usePriceHistory } from "@/lib/hooks";
import { currencySymbol } from "@/lib/utils";
import type { Asset } from "@/lib/supabase";

interface Props {
  asset: Asset;
}

export function CryptoVolatilityBlock({ asset }: Props) {
  if (asset.type !== "crypto") return null;
  // No symbol means no intraday data; skip the block rather than show all "—"
  if (!asset.symbol) return null;
  return <CryptoVolatilityBlockInner asset={asset} symbol={asset.symbol} />;
}

function CryptoVolatilityBlockInner({ asset, symbol }: { asset: Asset; symbol: string }) {
  // symbol is guaranteed non-null/empty here — usePriceHistory will always fetch
  const { closes, loading } = usePriceHistory(symbol, "1D");

  // Don't render until the fetch resolves; if no data came back, skip the block
  if (!loading && closes.length === 0) return null;

  const high = closes.length ? Math.max(...closes) : null;
  const low = closes.length ? Math.min(...closes) : null;
  const range =
    high != null && low != null && high > 0
      ? (((high - low) / high) * 100).toFixed(2).replace(".", ",")
      : null;

  const sym = currencySymbol(asset.currency);

  const fmtPrice = (n: number | null) => {
    if (n == null) return "—";
    const formatted = n >= 1000
      ? n.toLocaleString("nl-NL", { maximumFractionDigits: 0 })
      : n.toFixed(2).replace(".", ",");
    return `${sym}${formatted}`;
  };

  return (
    <div
      className="rounded-xl border border-border mb-4"
      style={{ background: "var(--surface)", padding: "14px 16px" }}
    >
      <div
        className="font-mono text-faint uppercase mb-3"
        style={{ fontSize: 11, letterSpacing: "0.18em" }}
      >
        24h range
      </div>
      {loading ? (
        <div className="flex gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex-1 space-y-1.5">
              <div className="h-2 rounded-full bg-surface-elev animate-pulse w-10" />
              <div className="h-3 rounded-full bg-surface-elev animate-pulse w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "24h high", value: fmtPrice(high) },
            { label: "24h low",  value: fmtPrice(low)  },
            { label: "range",    value: range ? `${range}%` : "—" },
          ].map(({ label, value }) => (
            <div key={label}>
              <div
                className="font-mono text-faint uppercase mb-1"
                style={{ fontSize: 11, letterSpacing: "0.12em" }}
              >
                {label}
              </div>
              <div
                className="font-mono text-fg"
                style={{ fontSize: 13, fontWeight: 500 }}
              >
                {value}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
