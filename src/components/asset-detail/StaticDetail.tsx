"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { BondBlock } from "@/components/asset-detail/BondBlock";
import { formatDate } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, formatMoneyParts, type DisplayCurrency } from "@/lib/money";
import type { StaticAsset, BondsAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: StaticAsset | BondsAsset;
}

function HeroPrice({ amount, fromCurrency, displayCurrency }: { amount: number; fromCurrency: string; displayCurrency: ReturnType<typeof useDisplayCurrency> }) {
  const parts = formatMoneyParts(amount, fromCurrency, displayCurrency);
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

function AssetIcon({ asset }: { asset: StaticAsset | BondsAsset }) {
  if (asset.type === "bonds") {
    return (
      <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"
        style={{ color: "var(--text-dim)", width: 26, height: 26 }}>
        <path d="M152,200H40a8,8,0,0,1-8-8V64a8,8,0,0,1,8-8H216a8,8,0,0,1,8,8v76"/>
        <circle cx="188" cy="188" r="28"/>
        <polyline points="188 216 188 240 175 232 161 240 161 209"/>
        <line x1="64" y1="96" x2="192" y2="96"/>
        <line x1="64" y1="128" x2="128" y2="128"/>
        <line x1="64" y1="160" x2="112" y2="160"/>
      </svg>
    );
  }
  // wallet icon for cash/pension/other
  return (
    <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", width: 26, height: 26 }}>
      <path d="M216,72H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,64V192a24,24,0,0,0,24,24H216a8,8,0,0,0,8-8V80A8,8,0,0,0,216,72Z"/>
      <circle cx="180" cy="144" r="12" fill="currentColor"/>
    </svg>
  );
}

export function StaticDetail({ asset }: Props) {
  const router = useRouter();
  const supabase = createBrowserSupabase();
  const [mutations, setMutations] = useState<Mutation[]>([]);

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

  // Compute this-year delta for the change pill
  const currentYear = new Date().getFullYear();
  const thisYearDelta = mutations.reduce((sum, m) => {
    const year = m.occurred_at ? new Date(m.occurred_at).getFullYear() : null;
    if (year !== currentYear) return sum;
    if (m.action === "add" && m.after_value != null && m.before_value != null) return sum + m.after_value - m.before_value;
    if (m.action === "add" && m.after_value != null && m.before_value == null) return sum + m.after_value;
    if (m.action === "edit" && m.after_value != null && m.before_value != null) return sum + m.after_value - m.before_value;
    if (m.action === "remove" && m.before_value != null) return sum - m.before_value;
    return sum;
  }, 0);
  const showPill = thisYearDelta !== 0;

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

        {/* Identity */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 44, height: 44,
            borderRadius: "var(--radius-md)",
            background: "var(--surface)",
            border: "0.5px solid var(--border-strong)",
            overflow: "hidden",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <AssetIcon asset={asset} />
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 500,
            color: "var(--hero)",
            letterSpacing: "-0.01em",
            lineHeight: "var(--lh-tight)",
            fontVariationSettings: "'opsz' 24",
          }}>
            {asset.name}
          </div>
        </div>

        {/* Balance / market value hero */}
        <div style={{ marginBottom: 30 }}>
          <div className="ad-eyebrow" style={{ marginBottom: 8 }}>
            {asset.type === "bonds" ? "Market value" : "Balance"}
          </div>
          <div style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--hero)",
            lineHeight: 1,
            fontVariationSettings: "'opsz' 60",
            marginBottom: 10,
          }}>
            <HeroPrice amount={asset.value} fromCurrency={asset.currency || "USD"} displayCurrency={displayCurrency} />
          </div>
          {showPill && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: "var(--radius-pill)",
              fontSize: 13,
              fontWeight: 500,
              fontFamily: "var(--font-numeric)",
              fontFeatureSettings: '"tnum" 1',
              background: thisYearDelta >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
              color: thisYearDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)",
            }}>
              <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor">
                {thisYearDelta >= 0
                  ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" />
                  : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />
                }
              </svg>
              {thisYearDelta >= 0 ? "+" : "−"}{formatMoney(Math.abs(thisYearDelta), asset.currency || "USD", displayCurrency)} this year
            </div>
          )}
          {/* Native currency subtitle — shown whenever the asset's native currency
              differs from the display currency (not just for non-USD), so a USD
              asset viewed in EUR makes clear the hero is a converted figure and
              shows the original native amount. */}
          {asset.currency && asset.currency !== displayCurrency && (
            <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 8, letterSpacing: "0.04em", fontFamily: "var(--font-numeric)" }}>
              Native currency: {asset.currency} · {formatMoney(asset.value, asset.currency, asset.currency as DisplayCurrency)}
            </div>
          )}
        </div>

        {/* Bond block */}
        {asset.type === "bonds" && <BondBlock asset={asset as BondsAsset} />}

        {/* Activity */}
        {mutations.length > 0 && (
          <div style={{ marginTop: asset.type === "bonds" ? 0 : 4 }}>
            <div className="ad-eyebrow" style={{ marginBottom: 12 }}>
              Activity
            </div>
            {mutations.map((m) => {
              const dateStr = m.occurred_at ?? m.recorded_at;
              let delta: string | null = null;
              let deltaPositive = true;
              let deltaNeutral = false;

              const mCur = m.currency || asset.currency || "USD";
              if (m.after_value != null) {
                if (m.action === "add" && m.before_value == null) {
                  delta = `Bought ${formatMoney(m.after_value, mCur, displayCurrency)}`; deltaNeutral = true;
                } else if (m.action === "add" && m.before_value != null) {
                  const d = m.after_value - m.before_value;
                  delta = `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), mCur, displayCurrency)}`; deltaPositive = d >= 0;
                } else if (m.action === "edit" && m.before_value != null) {
                  const d = m.after_value - m.before_value;
                  delta = `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), mCur, displayCurrency)}`; deltaPositive = d >= 0;
                } else {
                  delta = formatMoney(m.after_value, mCur, displayCurrency); deltaNeutral = true;
                }
              }

              return (
                <div key={m.id} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
                  <div style={{ fontSize: 13, color: "var(--text-faint)", fontFamily: "var(--font-numeric)", fontFeatureSettings: '"tnum" 1', width: 60, flexShrink: 0, paddingTop: 1 }}>
                    {dateStr ? formatDate(dateStr) : "—"}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {delta && (
                      <div style={{
                        fontSize: 15,
                        fontWeight: 500,
                        fontFamily: "var(--font-numeric)",
                        color: deltaNeutral ? "var(--text)" : deltaPositive ? "var(--positive-text)" : "var(--negative-text)",
                        marginBottom: 2,
                      }}>
                        {delta}
                      </div>
                    )}
                    {m.personal_context && (
                      <div style={{
                        fontFamily: "var(--font-display)",
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
