"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PriceChart } from "@/components/PriceChart";
import { CryptoVolatilityBlock } from "@/components/asset-detail/CryptoVolatilityBlock";
import { pctChange, formatDate, ACTION_STYLE, TYPE_LABEL, currencySymbol } from "@/lib/utils";
import { PriceDisplay } from "@/components/PriceDisplay";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { normalizePrice } from "@/lib/prices";
import type { TradeableAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: TradeableAsset;
}

function fmtPrice(n: number): string {
  return n >= 1000
    ? n.toLocaleString("en", { maximumFractionDigits: 0 })
    : n.toFixed(2);
}

function monogram(asset: TradeableAsset): string {
  if (asset.symbol) {
    return asset.symbol.replace(/-[A-Z]+$/i, "").slice(0, 4).toUpperCase();
  }
  return asset.name.slice(0, 3).toUpperCase();
}

export function TradeableDetail({ asset }: Props) {
  const router = useRouter();
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [livePrev, setLivePrev] = useState<number | null>(null);
  const [nativePrice, setNativePrice] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const supabase = createBrowserSupabase();

  useEffect(() => {
    if (!asset.symbol) return;
    let cancelled = false;
    fetch(`/api/prices?symbol=${encodeURIComponent(asset.symbol)}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && !data.error) {
          setLivePrice(normalizePrice(data.price, data.nativeCurrency));
          setLivePrev(data.previousClose ?? null);
          setNativePrice(data.nativePrice ?? null);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [asset.symbol, refreshKey]);

  const fetchMutations = useCallback(async () => {
    const { data } = await supabase
      .from("mutations")
      .select("*")
      .eq("asset_id", asset.id)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(10);
    setMutations(data ?? []);
  }, [asset.id]);

  useEffect(() => { fetchMutations(); }, [fetchMutations]);

  const currentValue = livePrice != null && asset.units
    ? Math.round(livePrice * asset.units)
    : asset.value;

  const dailyChg = pctChange(livePrice ?? undefined, livePrev ?? undefined);
  const dailyAbs =
    livePrice != null && livePrev != null && asset.units
      ? (livePrice - livePrev) * asset.units
      : null;
  const up = dailyChg != null && dailyChg >= 0;

  const totalReturn =
    nativePrice != null && asset.buy_price && asset.buy_price > 0
      ? ((nativePrice - asset.buy_price) / asset.buy_price) * 100
      : null;

  const sym = currencySymbol(asset.currency);
  const displayCurrency = useDisplayCurrency();
  const typeLabel = TYPE_LABEL[asset.type] ?? asset.type;
  const showCountry = asset.type !== "crypto";

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 pt-4 pb-32">

        {/* Top bar: back + refresh */}
        <div className="flex items-center justify-between mb-2" style={{ paddingBottom: 8 }}>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 font-mono text-dim"
            style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Back
          </button>
          {asset.symbol && (
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "var(--surface)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--text-dim)", cursor: "pointer",
              }}
              aria-label="Refresh price"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
        </div>

        {/* Header */}
        <div style={{ paddingBottom: 16 }}>
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="bg-surface border border-border flex items-center justify-center shrink-0 font-mono font-medium text-dim"
              style={{ width: 50, height: 50, borderRadius: 14, fontSize: 13 }}
            >
              {monogram(asset)}
            </div>
            <div>
              <div
                className="font-serif text-fg"
                style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.2, fontVariationSettings: "'opsz' 144" }}
              >
                {asset.name}
              </div>
              <div
                className="font-mono text-dim mt-0.5 flex items-center gap-1"
                style={{ fontSize: 10, letterSpacing: "0.05em" }}
              >
                {showCountry && asset.country && (
                  <>
                    <span>{asset.country}</span>
                    <span style={{ color: "var(--text-faint)" }}>·</span>
                  </>
                )}
                {typeLabel}
              </div>
            </div>
          </div>

          {/* Price hero */}
          <div
            className="font-serif font-light text-fg"
            style={{ fontSize: 38, letterSpacing: "-0.03em", lineHeight: 1, fontVariationSettings: "'opsz' 144" }}
          >
            <PriceDisplay amount={currentValue} displayCurrency={displayCurrency} />
          </div>

          {/* Change pill */}
          <div className="flex items-center gap-2.5 mt-3.5">
            {dailyChg !== null ? (
              <>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11, fontWeight: 500,
                    padding: "4px 8px", borderRadius: 6,
                    background: up ? "rgba(107,170,117,0.12)" : "rgba(201,122,110,0.12)",
                    color: up ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {up ? "+" : ""}{dailyChg.toFixed(2)}%
                </span>
                {dailyAbs !== null && (
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    {dailyAbs >= 0 ? "+" : ""}{formatMoney(dailyAbs, displayCurrency)} today
                  </span>
                )}
              </>
            ) : (
              <span className="font-mono text-faint" style={{ fontSize: 11 }}>No live data</span>
            )}
          </div>
        </div>

        {/* Chart */}
        {asset.symbol && <PriceChart symbol={asset.symbol} defaultRange="3M" />}

        {/* Metric grid — read-only */}
        <div className="grid grid-cols-2 gap-2 py-4">
          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div className="font-mono text-faint uppercase mb-2" style={{ fontSize: 9, letterSpacing: "0.16em" }}>
              Units
            </div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {asset.units != null ? asset.units.toLocaleString("en") : "—"}
            </div>
          </div>

          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div className="font-mono text-faint uppercase mb-2" style={{ fontSize: 9, letterSpacing: "0.16em" }}>
              Last buy price
            </div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {asset.buy_price != null ? `${sym}${fmtPrice(asset.buy_price)}` : "—"}
            </div>
          </div>

          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div className="font-mono text-faint uppercase mb-2" style={{ fontSize: 9, letterSpacing: "0.16em" }}>
              Live price
            </div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {livePrice != null ? formatMoney(livePrice, displayCurrency) : "—"}
            </div>
          </div>

          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div className="font-mono text-faint uppercase mb-2" style={{ fontSize: 9, letterSpacing: "0.16em" }}>
              Total return
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 14, fontWeight: 500,
                color: totalReturn == null ? "var(--text)" : totalReturn >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {totalReturn != null ? `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Crypto volatility */}
        <CryptoVolatilityBlock asset={asset} />

        {/* Recent activity */}
        {mutations.length > 0 && (
          <>
            <div
              className="font-serif text-fg"
              style={{ fontSize: 16, fontWeight: 400, margin: "18px 0 12px" }}
            >
              Recent activity
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {mutations.slice(0, 5).map((m) => {
                const style = ACTION_STYLE[m.action] ?? ACTION_STYLE.edit;
                const dateStr = m.occurred_at ?? m.recorded_at;
                const hasUnits = m.before_units != null || m.after_units != null;
                const noun = asset.type === "crypto" ? "units" : asset.type === "gold" ? "oz" : "shares";

                let activityLine: React.ReactNode = null;
                if (hasUnits) {
                  if (m.action === "add" && m.after_units != null) {
                    activityLine = `+${m.after_units.toLocaleString()} ${noun}`;
                  } else if (m.action === "edit") {
                    const unitDelta = (m.after_units ?? 0) - (m.before_units ?? 0);
                    if (unitDelta !== 0) {
                      activityLine = `${unitDelta >= 0 ? "+" : ""}${unitDelta.toLocaleString()} ${noun}`;
                    }
                  } else if (m.action === "remove" && m.before_units != null) {
                    activityLine = `${m.before_units.toLocaleString()} ${noun}`;
                  }
                }
                if (activityLine === null && m.after_value != null) {
                  activityLine = m.action === "add" && m.before_value != null
                    ? `+${formatMoney(m.after_value - m.before_value, displayCurrency)}`
                    : formatMoney(m.after_value, displayCurrency);
                }

                return (
                  <div
                    key={m.id}
                    className="border-b border-border last:border-0"
                    style={{ padding: "14px 0" }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span
                        className="font-mono"
                        style={{
                          fontSize: 9, fontWeight: 500,
                          padding: "2px 8px", borderRadius: 4,
                          letterSpacing: "0.1em", textTransform: "uppercase",
                          color: style.color, background: style.bg,
                        }}
                      >
                        {style.label}
                      </span>
                      <span
                        className="font-mono text-faint"
                        style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}
                      >
                        {dateStr ? formatDate(dateStr) : "—"}
                      </span>
                    </div>
                    {activityLine !== null && (
                      <div
                        className="font-serif text-fg"
                        style={{ fontSize: 17, fontWeight: 400, lineHeight: 1.3, marginBottom: 4 }}
                      >
                        {activityLine}
                      </div>
                    )}
                    {m.personal_context && (
                      <div
                        className="text-dim italic"
                        style={{
                          fontSize: 12, lineHeight: 1.55,
                          borderLeft: "2px solid var(--border-strong)",
                          paddingLeft: 10,
                        }}
                      >
                        &quot;{m.personal_context}&quot;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
