"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PropertyMap } from "@/components/PropertyMap";
import { MortgageBlock } from "@/components/MortgageBlock";
import { ValueComposition } from "@/components/ValueComposition";
import { MortgageProjectionLine } from "@/components/scenario/MortgageProjectionLine";
import { EstimatedValueChart } from "@/components/asset-detail/EstimatedValueChart";
import { formatDate } from "@/lib/utils";
import { computeCurrentBalance } from "@/lib/mortgage";
import { useDisplayCurrency } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { buildPropertyWhatIfSeed, requestWhatIf } from "@/lib/scenario/whatif";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: RealEstateAsset;
}


export function RealEstateDetail({ asset }: Props) {
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
  const isDesktop = useIsDesktop();
  const currentBalance = computeCurrentBalance(asset);
  const equity = asset.value - currentBalance;
  const hasMortgage = currentBalance > 0;

  // "What if?" — open chat seeded with deterministic mortgage scenario chips for
  // THIS property (figures pre-computed via projectMortgage/annuityPayment).
  const handleWhatIf = () => {
    const seed = buildPropertyWhatIfSeed(asset, displayCurrency);
    if (!seed) return;
    const handled = requestWhatIf(seed, !!isDesktop);
    if (!handled) router.push("/chat");
  };

  // Value appreciation since purchase: current value minus the recorded purchase
  // price (both structured fields on the asset). Equity-at-purchase would need the
  // original mortgage, which isn't stored (only the current balance is), so the
  // badge tracks value appreciation. The "since YEAR" label uses the structured
  // buy_date — never a record-creation timestamp or a mutation occurred_at.
  const purchasePrice = typeof asset.buy_price === "number" && asset.buy_price > 0 ? asset.buy_price : null;
  const purchaseYear = asset.buy_date ? new Date(asset.buy_date).getFullYear() : null;
  const valueGain = purchasePrice != null ? asset.value - purchasePrice : null;

  // "Owned since" uses a REAL acquisition date from structured fields (the stated
  // acquisition/buy date, or the mortgage start date) — never the record-creation
  // timestamp framed as a purchase date.
  const acquisitionStr = asset.buy_date ?? asset.mortgage_start_date ?? null;
  const acquisitionDate = acquisitionStr ? new Date(acquisitionStr) : null;
  const ownedSinceLabel = acquisitionDate
    ? acquisitionDate.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : null;
  const yearsOwned = acquisitionDate
    ? ((Date.now() - acquisitionDate.getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1).replace(/\.0$/, "")
    : null;


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

        {/* Map */}
        <div style={{ marginBottom: 18 }}>
          <PropertyMap asset={asset} />
        </div>

        {/* Identity */}
        <div style={{ marginBottom: 14 }}>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 24,
            fontWeight: 500,
            color: "var(--hero)",
            letterSpacing: "-0.02em",
            lineHeight: 1.05,
            fontVariationSettings: "'opsz' 24",
            marginBottom: 4,
          }}>
            {asset.name}
          </div>
          {asset.address && (
            <div style={{ fontSize: 13, color: "var(--text-dim)" }}>{asset.address}</div>
          )}
        </div>

        {/* Equity hero */}
        <div style={{ marginBottom: 10 }}>
          <div style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "var(--text-faint)",
            marginBottom: 4,
          }}>
            Equity
          </div>
          <div style={{
            fontFamily: "var(--font-serif)",
            fontSize: 44,
            fontWeight: 600,
            letterSpacing: "-0.03em",
            color: "var(--hero)",
            lineHeight: 1,
            fontVariationSettings: "'opsz' 60",
            marginBottom: 6,
          }}>
            <span>{formatMoney(equity, asset.currency || "USD", displayCurrency)}</span>
          </div>
          {/* Compact metadata line: value · size · owned since · years */}
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 10, lineHeight: 1.4 }}>
            {[
              <span key="val">of <span style={{ color: "var(--text)", fontWeight: 500 }}>{formatMoney(asset.value, asset.currency || "USD", displayCurrency)}</span> value</span>,
              asset.size_sqm ? <span key="size">{asset.size_sqm} m²</span> : null,
              ownedSinceLabel ? <span key="since">owned since {ownedSinceLabel}</span> : null,
              yearsOwned ? <span key="yrs">{yearsOwned} yrs</span> : null,
            ].filter(Boolean).reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, <span key={`sep${i}`} style={{ color: "var(--text-faint)" }}> · </span>, el], [])}
          </div>
          {purchaseYear != null && valueGain != null && (
            <div style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "4px 10px",
              borderRadius: 999,
              fontSize: 13,
              fontWeight: 500,
              fontFeatureSettings: '"tnum" 1',
              background: valueGain >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
              color: valueGain >= 0 ? "var(--positive-text)" : "var(--negative-text)",
            }}>
              <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor">
                {valueGain >= 0
                  ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" />
                  : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />
                }
              </svg>
              {valueGain >= 0 ? "+" : "−"}{formatMoney(Math.abs(valueGain), asset.currency || "USD", displayCurrency)} since {purchaseYear}
            </div>
          )}
        </div>

        {/* Value composition bar */}
        {hasMortgage && (
          <div style={{ marginBottom: 16 }}>
            <ValueComposition propertyValue={asset.value} mortgageBalance={currentBalance} />
          </div>
        )}

        {/* Mortgage section */}
        {hasMortgage && (
          <div style={{ marginBottom: 26 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
              Mortgage
            </div>
            {asset.mortgage_rate != null && (
              <div style={{ marginBottom: 14, paddingLeft: 4, paddingRight: 4 }}>
                <MortgageProjectionLine asset={asset} onExplore={handleWhatIf} />
              </div>
            )}
            <MortgageBlock asset={asset} />
          </div>
        )}

        {/* Per-year indicative value chart (NL only; self-hides when unavailable) */}
        <EstimatedValueChart asset={asset} />

        {/* Activity */}
        {mutations.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 6 }}>
              Activity
            </div>
            {mutations.map((m) => {
              const dateStr = m.occurred_at ?? m.recorded_at;

              // Unified display rule (real estate is never tradeable — skip unit branch)
              let delta: string | null = null;
              let deltaPositive = true;
              let deltaNeutral = false;

              const mCur = m.currency || asset.currency || "USD";
              if (m.after_value != null) {
                if (m.action === "add" && m.before_value == null) {
                  delta = `Bought ${formatMoney(m.after_value, mCur, displayCurrency)}`; deltaNeutral = true;
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
                  <div style={{ fontSize: 12, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1', width: 60, flexShrink: 0, paddingTop: 1 }}>
                    {dateStr ? formatDate(dateStr) : "—"}
                  </div>
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
