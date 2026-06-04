"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PropertyMap } from "@/components/PropertyMap";
import { MortgageBlock } from "@/components/MortgageBlock";
import { ValueComposition } from "@/components/ValueComposition";
import { WhatIfPill } from "@/components/WhatIfPill";
import { EstimatedValueChart } from "@/components/asset-detail/EstimatedValueChart";
import { formatDate } from "@/lib/utils";
import { computeCurrentBalance } from "@/lib/mortgage";
import { useDisplayCurrency } from "@/lib/hooks";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { buildPropertyWhatIfSeed, requestWhatIf } from "@/lib/scenario/whatif";
import { formatMoney, formatMoneyParts } from "@/lib/money";
import type { RealEstateAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: RealEstateAsset;
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

  // Compute equity gain from purchase mutation
  const purchaseMutation = mutations.slice().reverse().find(m => m.action === "add");
  const purchaseValue = purchaseMutation?.after_value ?? null;
  const purchaseYear = purchaseMutation?.occurred_at
    ? new Date(purchaseMutation.occurred_at).getFullYear()
    : null;
  const valueGain = purchaseValue != null ? asset.value - purchaseValue : null;

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

  const propertyRows = [
    { label: "Value", value: formatMoney(asset.value, asset.currency || "USD", displayCurrency), meta: null },
    asset.size_sqm ? { label: "Size", value: `${asset.size_sqm} m²`, meta: null } : null,
    { label: "Owned since", value: ownedSinceLabel ?? "Not set", meta: ownedSinceLabel && yearsOwned != null ? `${yearsOwned} years` : null },
  ].filter(Boolean) as { label: string; value: string; meta: string | null }[];

  return (
    <div className="min-h-screen bg-bg" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 8px)" }}>
      <div className="px-0 md:px-8" style={{ maxWidth: 600, margin: "0 auto", paddingBottom: 110 }}>

        {/* Top bar: back only */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 0 14px" }}>
          <button
            onClick={() => router.back()}
            style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", marginLeft: -8, color: "var(--text)", background: "none", border: "none", cursor: "pointer" }}
            aria-label="Back"
          >
            <svg width="22" height="22" viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round">
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
            marginBottom: 8,
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
            marginBottom: 10,
          }}>
            <HeroPrice amount={equity} fromCurrency={asset.currency || "USD"} displayCurrency={displayCurrency} />
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

        {/* Property section */}
        {propertyRows.length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
              Property
            </div>
            <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 26 }}>
              {propertyRows.map((row, idx) => (
                <div key={row.label} style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "10px 16px",
                  borderBottom: idx < propertyRows.length - 1 ? "0.5px solid var(--border)" : "none",
                  gap: 14,
                }}>
                  <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>{row.label}</span>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18", lineHeight: 1.1 }}>
                      {row.value}
                    </span>
                    {row.meta && (
                      <span style={{ fontSize: 11, fontWeight: 500, color: "var(--text-faint)", letterSpacing: "0.01em" }}>
                        {row.meta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Per-year indicative value chart (NL only; self-hides when unavailable) */}
        <EstimatedValueChart asset={asset} />

        {/* Mortgage section */}
        {hasMortgage && (
          <>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
              Mortgage
            </div>
            <MortgageBlock asset={asset} />
            {asset.mortgage_rate != null && (
              <div style={{ marginTop: 14 }}>
                <WhatIfPill onClick={handleWhatIf} />
              </div>
            )}
          </>
        )}

        {/* Activity */}
        {mutations.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
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
