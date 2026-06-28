"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PensionActivityList } from "@/components/asset-detail/PensionActivity";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, formatMoneyParts, type DisplayCurrency } from "@/lib/money";
import { yearsToAccess } from "@/lib/pension";
import type { StaticAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: StaticAsset;
  birthYear: number | null;
}

const PENSION_GROWTH_COLOR = "#7A8C6A";

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

// Recurring-calendar tile icon, drawn in the repo's Phosphor stroke style — no
// new icon dependency.
function CalendarIcon() {
  return (
    <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", width: 26, height: 26 }}>
      <rect x="40" y="48" width="176" height="160" rx="8" />
      <line x1="40" y1="96" x2="216" y2="96" />
      <line x1="88" y1="24" x2="88" y2="56" />
      <line x1="168" y1="24" x2="168" y2="56" />
      <circle cx="128" cy="148" r="14" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function PensionIncomeDetail({ asset, birthYear }: Props) {
  const router = useRouter();
  const [mutations, setMutations] = useState<Mutation[]>([]);

  useEffect(() => {
    let active = true;
    createBrowserSupabase()
      .from("mutations")
      .select("*")
      .eq("asset_id", asset.id)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(10)
      .then(({ data }) => { if (active) setMutations(data ?? []); });
    return () => { active = false; };
  }, [asset.id]);

  const displayCurrency = useDisplayCurrency();
  const cur = asset.currency || "USD";

  const isState = asset.pension_kind === "state";
  const annual = typeof asset.annual_income === "number" ? asset.annual_income : 0;
  const accessAge = typeof asset.access_age === "number" ? asset.access_age : null;
  const monthly = Math.round(annual / 12);

  const kindPill = isState ? "State pension · future income" : "Defined benefit · future income";
  const typeLabel = isState ? "State pension · PAYG" : "Defined benefit";

  const currentYear = new Date().getFullYear();
  const currentAge = birthYear != null ? currentYear - birthYear : null;
  const yta = yearsToAccess(accessAge, currentAge);

  const detailRows: { label: string; value: string; muted?: boolean }[] = [];
  if (asset.pension_provider) detailRows.push({ label: "Scheme", value: asset.pension_provider });
  detailRows.push({ label: "Type", value: typeLabel });
  detailRows.push({ label: "Annual amount", value: `${formatMoney(annual, cur, displayCurrency)} / year` });
  if (accessAge != null) {
    detailRows.push({
      label: "Starts at",
      value: yta != null && yta > 0 ? `Age ${accessAge} · in ${yta} ${yta === 1 ? "year" : "years"}` : `Age ${accessAge}`,
    });
  }
  detailRows.push({ label: "Indexation", value: "Not captured", muted: true });

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
            width: 44, height: 44, borderRadius: 10,
            background: "var(--surface)", border: "0.5px solid var(--border-strong)",
            overflow: "hidden", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <CalendarIcon />
          </div>
          <div>
            <div style={{
              fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 500,
              color: "var(--hero)", letterSpacing: "-0.01em", lineHeight: 1.05,
              fontVariationSettings: "'opsz' 24", marginBottom: 6,
            }}>
              {asset.name}
            </div>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "3px 9px", borderRadius: 999,
              background: "var(--surface-elev)", color: "var(--text-dim)",
              fontSize: 12, fontWeight: 500, letterSpacing: "0.01em",
            }}>
              <span style={{ width: 7, height: 7, borderRadius: 999, background: PENSION_GROWTH_COLOR }} />
              {kindPill}
            </span>
          </div>
        </div>

        {/* Guaranteed income hero */}
        <div style={{ marginBottom: 22 }}>
          <div className="ad-eyebrow" style={{ marginBottom: 8 }}>
            Guaranteed income
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            <span style={{
              fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 600,
              letterSpacing: "-0.03em", color: "var(--hero)", lineHeight: 1,
              fontVariationSettings: "'opsz' 60",
            }}>
              <HeroPrice amount={annual} fromCurrency={cur} displayCurrency={displayCurrency} />
            </span>
            <span style={{ fontSize: 16, fontWeight: 500, color: "var(--text-faint)" }}>/ year</span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--mono)", fontFeatureSettings: '"tnum" 1' }}>
            ≈ {formatMoney(monthly, cur, displayCurrency)} / month{accessAge != null ? `, from age ${accessAge}` : ""}
          </div>
          {asset.currency && asset.currency !== displayCurrency && (
            <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 8, letterSpacing: "0.04em", fontFamily: "var(--mono)" }}>
              Native currency: {asset.currency} · {formatMoney(annual, asset.currency, asset.currency as DisplayCurrency)} / year
            </div>
          )}
        </div>

        {/* Off-balance banner */}
        <div style={{ background: "var(--surface-elev)", borderRadius: 12, padding: "12px 16px", marginBottom: 26 }}>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.45 }}>
            Not counted in net worth. This is future income you&apos;ll receive, not a holding you own today.
          </div>
        </div>

        {/* Timeline */}
        {accessAge != null && (
          <div style={{ marginBottom: 26 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {currentAge != null && (
                <>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: "var(--text-dim)", flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 2, background: "var(--border-strong)", borderRadius: 999 }} />
                </>
              )}
              <span style={{ width: 11, height: 11, borderRadius: 999, background: PENSION_GROWTH_COLOR, flexShrink: 0 }} />
              {currentAge == null && <div style={{ flex: 1 }} />}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
              {currentAge != null && (
                <div style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--mono)" }}>
                  Now · age {currentAge}
                </div>
              )}
              <div style={{ fontSize: 13, color: "var(--text)", fontWeight: 500, textAlign: currentAge != null ? "right" : "left", fontFamily: "var(--mono)" }}>
                Income begins · age {accessAge}
              </div>
            </div>
          </div>
        )}

        {/* Details */}
        <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 26 }}>
          {detailRows.map((row, idx) => (
            <div key={row.label} style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 16px",
              borderBottom: idx < detailRows.length - 1 ? "0.5px solid var(--border)" : "none",
              gap: 14,
            }}>
              <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>{row.label}</span>
              <span style={{
                fontFamily: "var(--mono)", fontSize: 16, fontWeight: 500,
                color: row.muted ? "var(--text-faint)" : "var(--hero)",
                fontStyle: row.muted ? "italic" : "normal",
                letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', lineHeight: 1.1, textAlign: "right",
              }}>
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {/* Activity */}
        <PensionActivityList asset={asset} mutations={mutations} displayCurrency={displayCurrency} />

      </div>
    </div>
  );
}
