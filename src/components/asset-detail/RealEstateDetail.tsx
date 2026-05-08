"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PropertyMap } from "@/components/PropertyMap";
import { MortgageBlock } from "@/components/MortgageBlock";
import { ValueComposition } from "@/components/ValueComposition";
import { PriceDisplay } from "@/components/PriceDisplay";
import { streetViewUrlForAsset } from "@/lib/maps";
import { ACTION_STYLE, currencySymbol, formatDate } from "@/lib/utils";
import type { RealEstateAsset, Mutation } from "@/lib/supabase";

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
        <div
          className="font-serif"
          style={{ fontSize: 14, fontWeight: 400 }}
        >
          {title}
        </div>
        <span
          className="font-mono text-faint"
          style={{
            fontSize: 8, letterSpacing: "0.18em", textTransform: "uppercase",
            padding: "3px 7px",
            border: "1px solid var(--border-strong)",
            borderRadius: 4,
          }}
        >
          Soon
        </span>
      </div>
      <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
        {description}
      </div>
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

  const equity = asset.value - (asset.mortgage_balance ?? 0);
  const hasMortgage = (asset.mortgage_balance ?? 0) > 0;

  const streetViewUrl = streetViewUrlForAsset(asset.latitude, asset.longitude, asset.address);

  const streetAddress = asset.address ? asset.address.split(",")[0]?.trim() : undefined;
  const city = asset.address && streetAddress ? parseCity(asset.address, streetAddress) : undefined;

  const metaParts = [
    city,
    asset.country ?? undefined,
    asset.property_type ? asset.property_type.charAt(0).toUpperCase() + asset.property_type.slice(1) : undefined,
    asset.size_sqm ? `${asset.size_sqm} m²` : undefined,
  ].filter((x): x is string => typeof x === "string" && x.length > 0);

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto pt-4 pb-32">

        {/* Top bar */}
        <div className="flex justify-between items-center px-4 pb-2" style={{ paddingBottom: 14 }}>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 font-mono text-dim"
            style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Property
          </button>
          <div
            style={{
              width: 32, height: 32, borderRadius: "50%",
              background: "var(--surface)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "var(--text-dim)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </div>
        </div>

        {/* Photo hero — full width, no horizontal padding */}
        <PropertyMap asset={asset} />

        {/* Address block */}
        <div style={{ padding: "20px 22px 4px" }}>
          {streetViewUrl ? (
            <a
              href={streetViewUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, textDecoration: "none" }}
            >
              <AddressContent asset={asset} metaParts={metaParts} />
              <div
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  background: "var(--surface)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--accent)", flexShrink: 0, marginTop: 2,
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M5 12h14M13 5l7 7-7 7"/>
                </svg>
              </div>
            </a>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <AddressContent asset={asset} metaParts={metaParts} />
            </div>
          )}
        </div>

        {/* Equity hero */}
        <div style={{ padding: "16px 22px 4px" }}>
          <div
            className="font-mono uppercase text-faint"
            style={{ fontSize: 10, letterSpacing: "0.2em", marginBottom: 10 }}
          >
            Equity
          </div>
          <div
            className="font-serif font-light text-fg"
            style={{ fontSize: 42, letterSpacing: "-0.035em", lineHeight: 1, fontVariationSettings: "'opsz' 144" }}
          >
            <PriceDisplay amount={equity} currency={asset.currency} />
          </div>
        </div>

        {/* Value composition */}
        {hasMortgage && (
          <div style={{ padding: "22px 0 4px" }}>
            <ValueComposition
              propertyValue={asset.value}
              mortgageBalance={asset.mortgage_balance!}
              currency={asset.currency}
            />
          </div>
        )}

        {/* Mortgage section */}
        {hasMortgage && (
          <div style={{ paddingTop: 28 }}>
            <div
              style={{
                display: "flex", justifyContent: "space-between", alignItems: "baseline",
                padding: "0 22px", marginBottom: 14,
              }}
            >
              <div
                className="font-serif text-fg"
                style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
              >
                Mortgage
              </div>
              <span
                className="font-mono"
                style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}
              >
                EDIT
              </span>
            </div>
            <MortgageBlock asset={asset} />
          </div>
        )}

        {/* Future slots */}
        <div style={{ marginTop: hasMortgage ? 12 : 28 }}>
          <FutureSlot
            title="Valuation history"
            description="WOZ value · market estimate · track value drift over time"
          />
          <FutureSlot
            title="Cash flow"
            description="Rent income · mortgage outflow · maintenance · net monthly"
          />
        </div>

        {/* Activity */}
        <div style={{ padding: "28px 22px 0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div
              className="font-serif text-fg"
              style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
            >
              Activity
            </div>
            <span
              className="font-mono"
              style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}
            >
              ALL
            </span>
          </div>
        </div>

        {mutations.length > 0 ? (
          <div style={{ padding: "0 22px", borderTop: "1px solid var(--border)" }}>
            {mutations.map((m) => {
              const style = ACTION_STYLE[m.action] ?? ACTION_STYLE.edit;
              const dateStr = m.occurred_at ?? m.recorded_at;
              const sym = currencySymbol(asset.currency);
              return (
                <div
                  key={m.id}
                  className="border-b border-border last:border-0"
                  style={{ padding: "14px 0" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
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
                  {m.after_value != null && (
                    <div
                      className="font-serif text-fg"
                      style={{ fontSize: 14, fontWeight: 400, lineHeight: 1.3, margin: "3px 0 2px" }}
                    >
                      {m.action === "add" && m.before_value != null
                        ? `+${sym}${Math.round(m.after_value - m.before_value).toLocaleString()}`
                        : `${sym}${Math.round(m.after_value).toLocaleString()}`}
                    </div>
                  )}
                  {m.personal_context && (
                    <div
                      className="text-dim italic"
                      style={{
                        fontSize: 11, lineHeight: 1.5,
                        borderLeft: "2px solid var(--border-strong)",
                        paddingLeft: 9,
                      }}
                    >
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

        {/* CTAs */}
        <div style={{ display: "flex", gap: 8, padding: "22px 22px 28px" }}>
          <button
            className="font-mono text-center"
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12,
              fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
              background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
          <button
            onClick={() => router.push("/chat")}
            className="font-mono text-center"
            style={{
              flex: 1, padding: "11px 0", borderRadius: 12,
              fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
              background: "var(--accent)", color: "var(--bg)",
              border: "none", cursor: "pointer",
            }}
          >
            Discuss
          </button>
        </div>

      </div>
    </div>
  );
}

function extractCityFromPostcodeSegment(segment: string): string | undefined {
  const tokens = segment.split(/\s+/);
  let cityStart = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (/^[A-Z0-9]{1,8}$/.test(tokens[i])) {
      cityStart = i + 1;
    } else {
      break;
    }
  }
  if (cityStart === 0 || cityStart >= tokens.length) return undefined;
  return tokens.slice(cityStart).join(" ");
}

function parseCity(address: string, streetAddress: string): string | undefined {
  const parts = address.split(",").map(s => s.trim());
  for (let i = parts.length - 1; i > 0; i--) {
    const p = parts[i];
    if (/^[A-Z]{2}$/.test(p)) continue;
    if (p.toLowerCase() === streetAddress.toLowerCase()) return undefined;
    if (/\d/.test(p)) {
      const city = extractCityFromPostcodeSegment(p);
      if (city && city.toLowerCase() !== streetAddress.toLowerCase()) return city;
      continue;
    }
    return p;
  }
  return undefined;
}

function AddressContent({ asset, metaParts }: { asset: RealEstateAsset; metaParts: string[] }) {
  const streetAddress = asset.address
    ? asset.address.split(",")[0]?.trim()
    : asset.name;

  return (
    <div>
      <div
        className="font-serif text-fg"
        style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.3, fontVariationSettings: "'opsz' 144" }}
      >
        {streetAddress}
      </div>
      {metaParts.length > 0 && (
        <div
          className="font-mono text-dim"
          style={{ fontSize: 10, marginTop: 4, letterSpacing: "0.05em", textTransform: "uppercase" }}
        >
          {metaParts.join(" · ")}
        </div>
      )}
    </div>
  );
}
