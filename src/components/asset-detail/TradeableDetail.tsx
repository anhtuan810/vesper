"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PriceChart, type Range, type ScrubInfo } from "@/components/PriceChart";
import { CryptoVolatilityBlock } from "@/components/asset-detail/CryptoVolatilityBlock";
import { pctChange, formatDate } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import { AssetLogo } from "@/components/AssetLogo";
import { normalizePrice } from "@/lib/prices";
import type { TradeableAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: TradeableAsset;
}

const ONE_DAY_MS = 86_400_000;

function rangeToStartDate(range: Range): Date {
  const now = new Date();
  const ms: Record<Range, number> = {
    "1D": ONE_DAY_MS,
    "1W": 7 * ONE_DAY_MS,
    "1M": 30 * ONE_DAY_MS,
    "3M": 90 * ONE_DAY_MS,
    "1Y": 365 * ONE_DAY_MS,
    "3Y": 3 * 365 * ONE_DAY_MS,
  };
  return new Date(now.getTime() - ms[range]);
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
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [periodInfo, setPeriodInfo] = useState<{ pct: number; range: Range; label: string } | null>(null);
  const [scrubInfo, setScrubInfo] = useState<ScrubInfo | null>(null);
  const [earliestBuyDate, setEarliestBuyDate] = useState<Date | null>(null);
  const onPeriodChange = useRef((pct: number | null, range: Range, label: string) => {
    setPeriodInfo(pct !== null ? { pct, range, label } : null);
  }).current;
  const onScrub = useRef((info: ScrubInfo | null) => {
    setScrubInfo(info);
  }).current;
  const supabase = createBrowserSupabase();

  useEffect(() => {
    let cancelled = false;
    supabase
      .from("mutations")
      .select("occurred_at")
      .eq("asset_id", asset.id)
      .eq("action", "add")
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) {
          setEarliestBuyDate(
            data ? new Date(data.occurred_at) : asset.buy_date ? new Date(asset.buy_date) : null
          );
        }
      });
    return () => { cancelled = true; };
  }, [asset.id, asset.buy_date]); // eslint-disable-line react-hooks/exhaustive-deps

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
      .catch((err) => { console.error("Price fetch failed:", err); });
    return () => { cancelled = true; };
  }, [asset.symbol]);

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

  const avgBuyYear = asset.buy_date ? new Date(asset.buy_date).getFullYear() : null;

  // livePrice and nativePrice are both in native Yahoo currency, so no FX conversion needed.
  // buy_price is also stored in native currency — avgBuyPrice stays native.
  const avgBuyPrice = asset.buy_price ?? null;
  const assetCur = asset.currency || "USD";

  const totalReturnAbs = avgBuyPrice != null && avgBuyPrice > 0 && asset.units != null && livePrice != null
    ? (livePrice - avgBuyPrice) * asset.units
    : null;

  const noun = asset.type === "crypto" ? "units" : asset.type === "gold" ? "oz" : "shares";

  return (
    <div className="min-h-screen bg-bg" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
      <div className="px-0 md:px-8" style={{ maxWidth: 600, margin: "0 auto", paddingBottom: 110 }}>

        {/* Back */}
        <div style={{ padding: "12px 0 14px" }}>
          <button
            onClick={() => router.back()}
            style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -6, color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="160 208 80 128 160 48" />
            </svg>
          </button>
        </div>

        {/* Identity header */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <AssetLogo type={asset.type} symbol={asset.symbol ?? null} name={asset.name} size={44} />
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
          <div
            className="font-serif leading-none"
            style={{
              fontSize: 54,
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--hero)",
              fontVariationSettings: "'opsz' 60",
              marginBottom: 10,
            }}
          >
            <span>{formatMoney(
              scrubInfo && livePrice != null
                ? livePrice * scrubInfo.ratio
                : livePrice != null ? livePrice : (asset.buy_price ?? 0),
              assetCur,
              displayCurrency,
              2
            )}</span>
          </div>
          {(() => {
            // Scrubbing always shows scrub data unchanged
            if (scrubInfo) {
              const isUp = scrubInfo.pct >= 0;
              return (
                <div style={{ fontSize: 15, lineHeight: 1.4, fontFeatureSettings: '"tnum" 1' }}>
                  <span style={{ fontWeight: 500, color: isUp ? "var(--positive-text)" : "var(--negative-text)" }}>
                    {isUp ? "+" : "−"}{Math.abs(scrubInfo.pct).toFixed(2)}%
                  </span>
                  <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>{scrubInfo.label}</span>
                </div>
              );
            }
            if (periodInfo) {
              if (earliestBuyDate) {
                const now = new Date();
                const ageMs = now.getTime() - earliestBuyDate.getTime();
                // Case C: position added today
                if (ageMs < ONE_DAY_MS) {
                  return (
                    <div style={{ fontSize: 15, lineHeight: 1.4, fontFeatureSettings: '"tnum" 1' }}>
                      <span style={{ color: "var(--text-faint)" }}>Just added</span>
                    </div>
                  );
                }
                const chartRangeStart = rangeToStartDate(periodInfo.range);
                const effectiveStartMs = Math.max(chartRangeStart.getTime(), earliestBuyDate.getTime());
                // Case B: chart range extends more than 1 day before earliest buy
                if (effectiveStartMs - chartRangeStart.getTime() > ONE_DAY_MS) {
                  const pct = avgBuyPrice != null && avgBuyPrice > 0 && livePrice != null
                    ? ((livePrice - avgBuyPrice) / avgBuyPrice) * 100
                    : null;
                  const dateLabel = `since ${formatDate(earliestBuyDate.toISOString())}`;
                  return (
                    <div style={{ fontSize: 15, lineHeight: 1.4, fontFeatureSettings: '"tnum" 1' }}>
                      {pct !== null && (
                        <span style={{ fontWeight: 500, color: "var(--text-faint)" }}>
                          {pct >= 0 ? "+" : "−"}{Math.abs(pct).toFixed(2)}%
                        </span>
                      )}
                      <span style={{ color: "var(--text-faint)", marginLeft: pct !== null ? 6 : 0 }}>{dateLabel}</span>
                    </div>
                  );
                }
              }
              // Case A: chart range fits inside holding period (or no buy date yet)
              const isUp = periodInfo.pct >= 0;
              return (
                <div style={{ fontSize: 15, lineHeight: 1.4, fontFeatureSettings: '"tnum" 1' }}>
                  <span style={{ fontWeight: 500, color: isUp ? "var(--positive-text)" : "var(--negative-text)" }}>
                    {isUp ? "+" : "−"}{Math.abs(periodInfo.pct).toFixed(2)}%
                  </span>
                  <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>{periodInfo.label}</span>
                </div>
              );
            }
            if (dailyChg !== null) {
              return (
                <div style={{ fontSize: 15, lineHeight: 1.4, fontFeatureSettings: '"tnum" 1' }}>
                  <span style={{ fontWeight: 500, color: up ? "var(--positive-text)" : "var(--negative-text)" }}>
                    {dailyAbs != null && `${dailyAbs >= 0 ? "+" : "−"}${formatMoney(Math.abs(dailyAbs), assetCur, displayCurrency)} · `}
                    {up ? "+" : "−"}{Math.abs(dailyChg).toFixed(2)}%
                  </span>
                  <span style={{ color: "var(--text-dim)", marginLeft: 6 }}>today</span>
                </div>
              );
            }
            return <div style={{ fontSize: 12, color: "var(--text-faint)" }}>No live data</div>;
          })()}
        </div>

        {/* Price chart */}
        {asset.symbol && <PriceChart symbol={asset.symbol} defaultRange="1M" onPeriodChange={onPeriodChange} onScrub={onScrub} />}

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
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", gap: 14, minHeight: 58 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Current value</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {formatMoney(currentValue, assetCur, displayCurrency)}
                </span>
              </div>
            </div>
            {/* Total return */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 16px", borderBottom: "0.5px solid var(--border)", gap: 14, minHeight: 58 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Total return</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: totalReturnAbs != null && totalReturnAbs < 0 ? "var(--negative-text)" : "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {totalReturnAbs != null ? `${totalReturnAbs >= 0 ? "+" : "−"}${formatMoney(Math.abs(totalReturnAbs), assetCur, displayCurrency)}` : "—"}
                </span>
                {totalReturnAbs != null && avgBuyPrice != null && avgBuyPrice > 0 && livePrice != null && (
                  <span style={{
                    fontSize: 11, fontWeight: 500,
                    color: totalReturnAbs >= 0 ? "var(--positive-text)" : "var(--negative-text)",
                    letterSpacing: "0.01em",
                    fontFeatureSettings: '"tnum" 1',
                  }}>
                    {totalReturnAbs >= 0 ? "+" : "−"}{Math.abs((livePrice - avgBuyPrice) / avgBuyPrice * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            {/* Avg buy */}
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "10px 16px", gap: 14, minHeight: 58 }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>Avg buy</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 17, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18" }}>
                  {avgBuyPrice != null ? formatMoney(avgBuyPrice, assetCur, displayCurrency) : "—"}
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
              let delta: string | null = null;
              let deltaPositive = true;
              let deltaNeutral = false;

              // Unified display rule
              if (m.before_units != null && m.after_units != null) {
                // Both unit fields present: show unit delta
                const d = m.after_units - m.before_units;
                if (d !== 0) { delta = `${d >= 0 ? "+" : ""}${d.toLocaleString()} ${noun}`; deltaPositive = d >= 0; }
              } else if (m.action === "add" && m.after_units != null && m.before_units == null) {
                // Initial buy: both fields technically partial — show as add
                delta = `+${m.after_units.toLocaleString()} ${noun}`;
              } else if (m.action === "remove" && m.before_units != null && m.after_units == null) {
                delta = `−${m.before_units.toLocaleString()} ${noun}`; deltaPositive = false;
              } else if (m.after_value != null) {
                // No unit data: fall back to signed value delta
                const mCur = m.currency || assetCur;
                if (m.action === "add" && m.before_value == null) {
                  delta = `${formatMoney(m.after_value, mCur, displayCurrency)}`; deltaNeutral = true;
                } else {
                  const d = (m.after_value ?? 0) - (m.before_value ?? 0);
                  if (d !== 0) {
                    delta = `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), mCur, displayCurrency)}`; deltaPositive = d >= 0;
                  }
                }
              }

              // Hide row entirely if no delta and no context
              if (!delta && !m.personal_context) return null;

              return (
                <div key={m.id} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
                  {dateStr && <ActivityDate dateStr={dateStr} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {delta && (
                      <div style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: deltaNeutral ? "var(--text)" : deltaPositive ? "var(--positive-text)" : "var(--negative-text)",
                        marginBottom: m.personal_context ? 2 : 0,
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
