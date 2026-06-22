"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PensionActivityList } from "@/components/asset-detail/PensionActivity";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney, formatMoneyParts, type DisplayCurrency } from "@/lib/money";
import { projectPension, yearsToAccess, PENSION_PROJECTION_DISCLAIMER } from "@/lib/pension";
import type { StaticAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: StaticAsset;
  birthYear: number | null;
}

// Pension type color token (tokens.ts) — the lighter green used for the growth
// portion of the contributed/growth split.
const PENSION_GROWTH_COLOR = "#7A9E8B";

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

function WalletIcon() {
  return (
    <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round"
      style={{ color: "var(--text-dim)", width: 26, height: 26 }}>
      <path d="M216,72H56a8,8,0,0,1,0-16H192a8,8,0,0,0,0-16H56A24,24,0,0,0,32,64V192a24,24,0,0,0,24,24H216a8,8,0,0,0,8-8V80A8,8,0,0,0,216,72Z"/>
      <circle cx="180" cy="144" r="12" fill="currentColor"/>
    </svg>
  );
}

const nlPct = (rate: number) =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rate) + "%";

export function PensionCapitalDetail({ asset, birthYear }: Props) {
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

  // This-year delta pill — same logic as the static detail hero.
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

  const growthRate = typeof asset.mortgage_rate === "number" ? asset.mortgage_rate : null;
  const accessAge = typeof asset.access_age === "number" ? asset.access_age : null;
  const monthly = typeof asset.monthly_contribution === "number" ? asset.monthly_contribution : null;

  const detailRows: { label: string; value: string }[] = [];
  if (asset.pension_provider) detailRows.push({ label: "Provider", value: asset.pension_provider });
  if (growthRate != null) detailRows.push({ label: "Growth assumption", value: `${nlPct(growthRate)} per year` });
  if (monthly != null) detailRows.push({ label: "Monthly contribution", value: monthly > 0 ? formatMoney(monthly, cur, displayCurrency) : "Not contributing" });
  if (accessAge != null) detailRows.push({ label: "Access age", value: `${accessAge}` });

  // Projection — numbers come SOLELY from projectPension; never recomputed here.
  // Hidden entirely when value, growth, access age or birth year is missing, or
  // there's no time left to access (no broken/NaN state).
  const currentAge = birthYear != null ? currentYear - birthYear : null;
  const yta = yearsToAccess(accessAge, currentAge);
  const canProject =
    Number.isFinite(asset.value) && asset.value > 0 &&
    growthRate != null && growthRate > 0 &&
    accessAge != null && birthYear != null &&
    yta != null && yta > 0;
  const projection = canProject
    ? projectPension({ potValue: asset.value, monthlyContribution: monthly ?? 0, growthRatePct: growthRate!, yearsToAccess: yta! })
    : null;
  const contributedPct = projection && projection.projected > 0
    ? Math.max(0, Math.min(100, (projection.contributed / projection.projected) * 100))
    : 100;
  const growthPct = 100 - contributedPct;

  const accessYear = birthYear != null && accessAge != null ? birthYear + accessAge : null;

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
            <WalletIcon />
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
              Defined contribution · a pot
            </span>
          </div>
        </div>

        {/* Value hero */}
        <div style={{ marginBottom: 30 }}>
          <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>
            Value
          </div>
          <div style={{
            fontFamily: "var(--font-serif)", fontSize: 48, fontWeight: 600,
            letterSpacing: "-0.03em", color: "var(--hero)", lineHeight: 1,
            fontVariationSettings: "'opsz' 60", marginBottom: 10,
          }}>
            <HeroPrice amount={asset.value} fromCurrency={cur} displayCurrency={displayCurrency} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {showPill && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 999, fontSize: 13, fontWeight: 500,
                fontFeatureSettings: '"tnum" 1',
                background: thisYearDelta >= 0 ? "var(--positive-soft)" : "var(--negative-soft)",
                color: thisYearDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)",
              }}>
                <svg width="11" height="11" viewBox="0 0 256 256" fill="currentColor">
                  {thisYearDelta >= 0
                    ? <path d="M216,72v96a8,8,0,0,1-8,8H112a8,8,0,0,1-5.66-13.66L208,60.69Z" />
                    : <path d="M216,184v-96a8,8,0,0,0-8-8H112a8,8,0,0,0-5.66,13.66L208,195.31Z" />}
                </svg>
                {thisYearDelta >= 0 ? "+" : "−"}{formatMoney(Math.abs(thisYearDelta), cur, displayCurrency)} this year
              </div>
            )}
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 500,
              background: "var(--surface-elev)", color: "var(--text-dim)", letterSpacing: "0.01em",
            }}>
              Counts toward net worth
            </span>
          </div>
          {asset.currency && asset.currency !== displayCurrency && (
            <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 8, letterSpacing: "0.04em", fontFamily: "var(--font-sans)" }}>
              Native currency: {asset.currency} · {formatMoney(asset.value, asset.currency, asset.currency as DisplayCurrency)}
            </div>
          )}
        </div>

        {/* Details */}
        {detailRows.length > 0 && (
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, overflow: "hidden", marginBottom: 26 }}>
            {detailRows.map((row, idx) => (
              <div key={row.label} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 16px",
                borderBottom: idx < detailRows.length - 1 ? "0.5px solid var(--border)" : "none",
                gap: 14,
              }}>
                <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 500, flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500, color: "var(--hero)", letterSpacing: "-0.005em", fontFeatureSettings: '"tnum" 1', fontVariationSettings: "'opsz' 18", lineHeight: 1.1, textAlign: "right" }}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Projection */}
        {projection && (
          <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 26 }}>
            <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 8 }}>
              Projected at {accessAge} (in {yta} {yta === 1 ? "year" : "years"})
            </div>
            <div style={{
              fontFamily: "var(--font-serif)", fontSize: 34, fontWeight: 600,
              letterSpacing: "-0.02em", color: "var(--hero)", lineHeight: 1,
              fontVariationSettings: "'opsz' 40", marginBottom: 16,
            }}>
              ≈ {formatMoney(projection.projected, cur, displayCurrency)}
            </div>

            {/* Contributed vs Growth split bar (ValueComposition style) */}
            <div style={{ display: "flex", width: "100%", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--surface-elev)", marginBottom: 12 }}>
              <div style={{ width: `${contributedPct}%`, height: "100%", background: "var(--accent)", borderRadius: growthPct > 0 ? "999px 0 0 999px" : 999 }} />
              {growthPct > 0 && (
                <div style={{ flex: 1, height: "100%", background: PENSION_GROWTH_COLOR, borderRadius: "0 999px 999px 0" }} />
              )}
            </div>
            <div style={{ display: "flex", gap: 18, marginBottom: 14 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-dim)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: "var(--accent)" }} />
                Contributed {formatMoney(projection.contributed, cur, displayCurrency)}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-dim)" }}>
                <span style={{ width: 8, height: 8, borderRadius: 999, background: PENSION_GROWTH_COLOR }} />
                Growth {formatMoney(projection.growth, cur, displayCurrency)}
              </span>
            </div>

            <div style={{
              fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 13,
              color: "var(--text-dim)", lineHeight: 1.4, fontVariationSettings: "'opsz' 14",
            }}>
              {PENSION_PROJECTION_DISCLAIMER}
            </div>
          </div>
        )}

        {/* Locked note */}
        {accessAge != null && (
          <div style={{ background: "var(--surface-elev)", borderRadius: 12, padding: "12px 16px", marginBottom: 26 }}>
            <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.45 }}>
              {accessYear != null
                ? `Locked until ${accessYear}. Shows as locked in liquidity.`
                : `Locked until age ${accessAge}. Shows as locked in liquidity.`}
            </div>
          </div>
        )}

        {/* Activity */}
        <PensionActivityList asset={asset} mutations={mutations} displayCurrency={displayCurrency} />

      </div>
    </div>
  );
}
