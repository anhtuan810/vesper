"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PropertyMap } from "@/components/PropertyMap";
import { MortgageBlock } from "@/components/MortgageBlock";
import { ValueComposition } from "@/components/ValueComposition";
import { PriceDisplay } from "@/components/PriceDisplay";
import { ACTION_STYLE, formatDate } from "@/lib/utils";
import { computeCurrentBalance } from "@/lib/mortgage";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset, Mutation } from "@/lib/supabase";

const PROP_TYPE_LABEL: Record<string, string> = {
  house: "House",
  apartment: "Apartment",
  office: "Office",
  land: "Land",
  other: "Other",
};

interface Props {
  asset: RealEstateAsset;
}

function FutureSlot({ title, description }: { title: string; description: string }) {
  return (
    <div
      style={{
        margin: "12px 16px 0",
        padding: "14px 16px",
        background: "var(--surface)",
        border: "1px dashed var(--border-strong)",
        borderRadius: 14,
        opacity: 0.65,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div className="font-serif" style={{ fontSize: 14, fontWeight: 400 }}>{title}</div>
        <span
          className="font-mono text-faint"
          style={{ fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase", padding: "3px 7px", border: "1px solid var(--border-strong)", borderRadius: 4 }}
        >
          Soon
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>{description}</div>
    </div>
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
  const currentBalance = computeCurrentBalance(asset);
  const equity = asset.value - currentBalance;
  const hasMortgage = currentBalance > 0;
  const propTypeLabel = asset.property_type ? PROP_TYPE_LABEL[asset.property_type] ?? asset.property_type : null;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto pt-4 pb-32">

        {/* Top bar: back only */}
        <div className="flex justify-between items-center px-4" style={{ paddingBottom: 14 }}>
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
        </div>

        {/* Map */}
        <PropertyMap asset={asset} />

        {/* Address block */}
        <div style={{ padding: "20px 22px 4px" }}>

          {/* Name */}
          <div className="font-serif text-fg" style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.3, fontVariationSettings: "'opsz' 144" }}>
            {asset.name}
          </div>

          {/* Address */}
          {asset.address && (
            <div className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em", marginTop: 4 }}>
              {asset.address}
            </div>
          )}

          {/* country · property_type · size_sqm */}
          <div className="flex items-center gap-1 font-mono text-dim" style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase", marginTop: 6 }}>
            {asset.country && <span>{asset.country}</span>}
            {asset.country && (propTypeLabel || asset.size_sqm) && <span style={{ color: "var(--text-faint)" }}>·</span>}
            {propTypeLabel && <span>{propTypeLabel}</span>}
            {propTypeLabel && asset.size_sqm && <span style={{ color: "var(--text-faint)" }}>·</span>}
            {asset.size_sqm && <span>{asset.size_sqm} m²</span>}
          </div>

          {/* Native currency */}
          <div className="font-mono text-faint" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 5 }}>
            Native: {asset.currency ?? "EUR"}
          </div>
        </div>

        {/* Property value + Equity */}
        <div style={{ padding: "16px 22px 0", borderBottom: "1px solid var(--border)", marginBottom: 0 }}>
          <div className="flex items-center justify-between" style={{ paddingBottom: 16 }}>
            <div className="font-mono uppercase text-faint" style={{ fontSize: 10, letterSpacing: "0.2em" }}>
              Property value
            </div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {formatMoney(asset.value, displayCurrency)}
            </div>
          </div>
        </div>

        {/* Equity hero */}
        <div style={{ padding: "16px 22px 4px" }}>
          <div className="font-mono uppercase text-faint" style={{ fontSize: 10, letterSpacing: "0.2em", marginBottom: 10 }}>
            Equity
          </div>
          <div className="font-serif font-light text-fg" style={{ fontSize: 42, letterSpacing: "-0.035em", lineHeight: 1, fontVariationSettings: "'opsz' 144" }}>
            <PriceDisplay amount={equity} displayCurrency={displayCurrency} />
          </div>
        </div>

        {/* Value composition */}
        {hasMortgage && (
          <div style={{ padding: "22px 0 4px" }}>
            <ValueComposition
              propertyValue={asset.value}
              mortgageBalance={currentBalance}
            />
          </div>
        )}

        {/* Mortgage section */}
        {hasMortgage && (
          <div style={{ paddingTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "0 22px", marginBottom: 14 }}>
              <div className="font-serif text-fg" style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}>
                Mortgage
              </div>
            </div>
            <MortgageBlock asset={asset} />
          </div>
        )}

        {/* Future slots */}
        <div style={{ marginTop: hasMortgage ? 12 : 28 }}>
          <FutureSlot title="Valuation history" description="WOZ value · market estimate · track value drift over time" />
          <FutureSlot title="Cash flow" description="Rent income · mortgage outflow · maintenance · net monthly" />
        </div>

        {/* Activity */}
        <div style={{ padding: "28px 22px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div className="font-serif text-fg" style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}>
              Activity
            </div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}>ALL</span>
          </div>
        </div>

        {mutations.length > 0 ? (
          <div style={{ padding: "0 22px", borderTop: "1px solid var(--border)" }}>
            {mutations.map((m) => {
              const style = ACTION_STYLE[m.action] ?? ACTION_STYLE.edit;
              const dateStr = m.occurred_at ?? m.recorded_at;
              return (
                <div key={m.id} className="border-b border-border last:border-0" style={{ padding: "14px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                    <span className="font-mono" style={{ fontSize: 9, fontWeight: 500, padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em", textTransform: "uppercase", color: style.color, background: style.bg }}>
                      {style.label}
                    </span>
                    <span className="font-mono text-faint" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      {dateStr ? formatDate(dateStr) : "—"}
                    </span>
                  </div>
                  {m.after_value != null && (
                    <div className="font-serif text-fg" style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, margin: "3px 0 2px" }}>
                      {m.action === "add" && m.before_value != null
                        ? `+${formatMoney(m.after_value - m.before_value, displayCurrency)}`
                        : formatMoney(m.after_value, displayCurrency)}
                    </div>
                  )}
                  {m.personal_context && (
                    <div className="text-dim italic" style={{ fontSize: 11, lineHeight: 1.5, borderLeft: "2px solid var(--border-strong)", paddingLeft: 9 }}>
                      &quot;{m.personal_context}&quot;
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "0 22px 14px" }}>
            <div className="font-mono text-faint" style={{ fontSize: 11 }}>No activity yet.</div>
          </div>
        )}

      </div>
    </div>
  );
}
