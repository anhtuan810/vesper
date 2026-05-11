"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PriceChart } from "@/components/PriceChart";
import { CryptoVolatilityBlock } from "@/components/asset-detail/CryptoVolatilityBlock";
import { pctChange, formatDate } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, formatMoneyParts } from "@/lib/money";
import { normalizePrice } from "@/lib/prices";
import type { TradeableAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: TradeableAsset;
}

function monogram(asset: TradeableAsset): string {
  if (asset.symbol) return asset.symbol.replace(/-[A-Z]+$/i, "").slice(0, 4).toUpperCase();
  return asset.name.slice(0, 3).toUpperCase();
}

function HeroPrice({ amount, displayCurrency }: { amount: number; displayCurrency: ReturnType<typeof useDisplayCurrency> }) {
  const parts = formatMoneyParts(amount, displayCurrency);
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-start", columnGap: "0.1em" }}>
      {parts.sign && <span style={{ lineHeight: "inherit" }}>{parts.sign}</span>}
      <span style={{ fontSize: "0.52em", lineHeight: 1, paddingTop: "0.08em", color: "var(--text-faint)", fontWeight: 500 }}>
        {parts.symbol}
      </span>
      <span style={{ lineHeight: "inherit" }}>{parts.amount}</span>
    </span>
  );
}

function ActivityDate({ dateStr }: { dateStr: string }) {
  return (
    <div style={{
      fontSize: 12,
      color: "var(--text-faint)",
      fontFeatureSettings: '"tnum" 1',
      width: 56,
      flexShrink: 0,
      paddingTop: 1,
    }}>
      {formatDate(dateStr)}
    </div>
  );
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

  const displayCurrency = useDisplayCurrency();
  const currentValue = livePrice != null && asset.units
    ? Math.round(livePrice * asset.units)
    : asset.value;

  const dailyChg = pctChange(livePrice ?? undefined, livePrev ?? undefined);
  const dailyAbs =
    livePrice != null && livePrev != null && asset.units
      ? (livePrice - livePrev) * asset.units
      : null;
  const up = dailyChg != null && dailyChg >= 0;

  const avgBuyPrice = asset.buy_price;
  const avgBuyYear = mutations.length > 0
    ? new Date(mutations[mutations.length - 1].occurred_at ?? mutations[mutations.length - 1].recorded_at).getFullYear()
    : null;

  const totalReturnAbs = nativePrice != null && asset.buy_price && asset.buy_price > 0 && asset.units
    ? (nativePrice - asset.buy_price) * asset.units
    : null;

  const noun = asset.type === "crypto" ? "units" : asset.type === "gold" ? "oz" : "shares";

  return (
    <div className="min-h-screen bg-bg">
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 22px 110px" }}>

        {/* Top bar: back left, refresh right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0 18px" }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -8, color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="160 208 80 128 160 48" />
            </svg>
          </button>
          {asset.symbol && (
            <div style={{ display: "flex", gap: 18, alignItems: "center", color: "var(--text-dim)" }}>
              <button
                onClick={() => setRefreshKey((k) => k + 1)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", display: "flex" }}
                aria-label="Refresh price"
              >
                <svg width="22" height="22" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="176 40 224 40 224 88" />
                  <path d="M65.16,65.16a88,88,0,0,1,124.49,0L224,99.51" />
                  <polyline points="80 216 32 216 32 168" />
                  <path d="M190.84,190.84a88,88,0,0,1-124.49,0L32,156.49" />
                </svg>
              </button>
            </div>
          )}
        </div>

        {/* Identity header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <div style={{
            width: 44, height: 44,
            borderRadius: 10,
            background: "var(--surface)",
            border: "0.5px solid var(--border)",
            overflow: "hidden",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            fontWeight: 600,
            color: "var(--text-dim)",
            fontFamily: "var(--font-sans)",
            letterSpacing: "0.02em",
          }}>
            {monogram(asset)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <div style={{
              fontFamily: "var(--font-serif)",
              fontSize: 22,
              fontWeight: 500,
              color: "var(--hero)",
              letterSpacing: "-0.01em",
              lineHeight: 1.05,
              fontVariationSettings: "'opsz' 24",
            }}>
              {asset.name}
            </div>
            {asset.units != null && (
              <div style={{ fontSize: 12, color: "var(--text-dim)", fontFeatureSettings: '"tnum" 1' }}>
                {asset.units.toLocaleString("en")} {noun}
              </div>
            )}
          </div>
        </div>

        {/* Market price hero */}
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 8,
          }}>
            Market price
          </div>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--hero)",
            lineHeight: 1,
            fontVariationSettings: "'opsz' 60",
            marginBottom: 10,
          }}>
            <HeroPrice amount={livePrice != null ? livePrice : (asset.buy_price ?? 0)} displayCurrency={displayCurrency} />
          </div>
          {dailyChg !== null ? (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              fontFeatureSettings: '"tnum" 1',
              background: up ? "var(--positive-soft)" : "var(--negative-soft)",
              color: up ? "var(--positive-text)" : "var(--negative-text)",
            }}>
              <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor">
                {up
                  ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" />
                  : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />
                }
              </svg>
              {dailyAbs != null && `${dailyAbs >= 0 ? "+" : ""}${formatMoney(Math.abs(dailyAbs), displayCurrency)} today · `}
              {up ? "+" : ""}{dailyChg.toFixed(2)}%
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No live data</div>
          )}
        </div>

        {/* Price chart */}
        {asset.symbol && <PriceChart symbol={asset.symbol} defaultRange="1M" />}

        {/* Your position */}
        <div style={{ marginTop: 26 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 12,
          }}>
            Your position
          </div>
          <div style={{
            background: "var(--surface)",
            border: "0.5px solid var(--border)",
            borderRadius: 14,
            overflow: "hidden",
          }}>
            {/* Current value */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", gap: 14 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Current value</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {formatMoney(currentValue, displayCurrency)}
                </span>
              </div>
            </div>
            {/* Total return */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", gap: 14 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Total return</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {totalReturnAbs != null ? `${totalReturnAbs >= 0 ? "+" : ""}${formatMoney(Math.abs(totalReturnAbs), displayCurrency)}` : "—"}
                </span>
                {totalReturnAbs != null && avgBuyPrice && asset.buy_price && asset.buy_price > 0 && nativePrice != null && (
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: totalReturnAbs >= 0 ? "var(--positive-text)" : "var(--negative-text)",
                    letterSpacing: "0.01em",
                    fontFeatureSettings: '"tnum" 1',
                  }}>
                    {totalReturnAbs >= 0 ? "+" : ""}{(((nativePrice - asset.buy_price) / asset.buy_price) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            {/* Avg buy */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", gap: 14 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Avg buy</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {avgBuyPrice != null ? formatMoney(avgBuyPrice, displayCurrency) : "—"}
                </span>
                {avgBuyYear && (
                  <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", letterSpacing: "0.01em" }}>
                    since {avgBuyYear}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Crypto volatility */}
        <div style={{ marginTop: 20 }}>
          <CryptoVolatilityBlock asset={asset} />
        </div>

        {/* Activity */}
        {mutations.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              marginBottom: 12,
            }}>
              Activity
            </div>
            {mutations.slice(0, 5).map((m) => {
              const dateStr = m.occurred_at ?? m.recorded_at;
              const hasUnits = m.before_units != null || m.after_units != null;
              let delta: string | null = null;
              let deltaPositive = true;
              let deltaNeutral = false;

              if (hasUnits) {
                if (m.action === "add" && m.after_units != null) {
                  delta = `+${m.after_units.toLocaleString()} ${noun}`;
                } else if (m.action === "edit") {
                  const d = (m.after_units ?? 0) - (m.before_units ?? 0);
                  if (d !== 0) { delta = `${d >= 0 ? "+" : ""}${d.toLocaleString()} ${noun}`; deltaPositive = d >= 0; }
                } else if (m.action === "remove" && m.before_units != null) {
                  delta = `−${m.before_units.toLocaleString()} ${noun}`; deltaPositive = false;
                }
              }
              if (delta === null && m.after_value != null) {
                if (m.action === "add" && m.before_value == null) {
                  delta = `${formatMoney(m.after_value, displayCurrency)}`; deltaNeutral = true;
                } else if (m.action === "add" && m.before_value != null) {
                  const d = m.after_value - m.before_value;
                  delta = `${d >= 0 ? "+" : ""}${formatMoney(Math.abs(d), displayCurrency)}`; deltaPositive = d >= 0;
                } else {
                  delta = formatMoney(m.after_value, displayCurrency); deltaNeutral = true;
                }
              }

              return (
                <div key={m.id} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
                  {dateStr && <ActivityDate dateStr={dateStr} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {delta && (
                      <div style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: deltaNeutral ? "var(--text)" : deltaPositive ? "var(--positive-text)" : "var(--negative-text)",
                        marginBottom: 2,
                      }}>
                        {delta}
                      </div>
                    )}
                    {m.personal_context && (
                      <div style={{
                        fontFamily: "var(--font-serif)",
                        fontStyle: "italic",
                        fontSize: 13,
                        color: "var(--text-dim)",
                        lineHeight: 1.4,
                        fontVariationSettings: "'opsz' 14",
                      }}>
                        {m.personal_context}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
