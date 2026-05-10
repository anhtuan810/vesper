"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PropertyMap } from "@/components/PropertyMap";
import { MortgageBlock } from "@/components/MortgageBlock";
import { ValueComposition } from "@/components/ValueComposition";
import { PriceDisplay } from "@/components/PriceDisplay";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import { DeleteAssetButton } from "@/components/asset-detail/DeleteAssetButton";
import { ContextNotePrompt } from "@/components/asset-detail/ContextNotePrompt";
import { ACTION_STYLE, formatDate } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { RealEstateAsset, Mutation } from "@/lib/supabase";

const PROP_TYPE_SELECT_STYLE: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  background: "transparent",
  border: "none",
  padding: "0 14px 0 0",
  fontSize: 10,
  fontFamily: "var(--mono)",
  color: "var(--text-dim)",
  cursor: "pointer",
  letterSpacing: "0.05em",
  textTransform: "uppercase" as const,
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='%2354545E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\")",
  backgroundRepeat: "no-repeat",
  backgroundPosition: "right 2px center",
  backgroundSize: "8px",
  outline: "none",
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

export function RealEstateDetail({ asset: initialAsset }: Props) {
  const router = useRouter();
  const [asset, setAsset] = useState<RealEstateAsset>(initialAsset);
  const supabase = createBrowserSupabase();
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [pendingNote, setPendingNote] = useState<string | null>(null);

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

  const patchField = useCallback(async (
    field: string,
    value: unknown
  ): Promise<{ asset: RealEstateAsset; mutation_id: string | null }> => {
    const res = await fetch(`/api/assets/${asset.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Save failed");
    }
    return res.json();
  }, [asset.id]);

  const handleUpdate = useCallback(async (field: string, value: unknown): Promise<string | null> => {
    try {
      const { asset: updated } = await patchField(field, value);
      setAsset(updated);
      fetchMutations();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : "Save failed";
    }
  }, [patchField, fetchMutations]);

  const displayCurrency = useDisplayCurrency();
  const equity = asset.value - (asset.mortgage_balance ?? 0);
  const hasMortgage = (asset.mortgage_balance ?? 0) > 0;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto pt-4 pb-32">

        {/* Top bar */}
        <div className="flex justify-between items-center px-4" style={{ paddingBottom: 14 }}>
          <button
            onClick={() => router.push('/')}
            className="flex items-center gap-1.5 font-mono text-dim"
            style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Property
          </button>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-dim)" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>
            </svg>
          </div>
        </div>

        {/* Map */}
        <PropertyMap asset={asset} />

        {/* Address block */}
        <div style={{ padding: "20px 22px 4px" }}>

          {/* ROW 1: Name */}
          <InlineEdit
            display={
              <span className="font-serif text-fg" style={{ fontSize: 18, fontWeight: 400, lineHeight: 1.3, fontVariationSettings: "'opsz' 144" }}>
                {asset.name}
              </span>
            }
            rawValue={asset.name}
            placeholder="e.g. Eindhoven"
            affordance
            displayStyle={{ minHeight: 32 }}
            inputStyle={{ fontSize: 18, fontFamily: "var(--serif)" }}
            onSave={async (raw) => {
              const v = raw.trim();
              if (!v) return "Name cannot be empty";
              return handleUpdate("name", v);
            }}
          />

          {/* ROW 2: Address + Street View button */}
          <div className="flex items-center" style={{ marginTop: 4, gap: 8 }}>
            <InlineEdit
              display={
                asset.address
                  ? <span className="font-mono" style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}>{asset.address}</span>
                  : <span className="font-mono" style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.04em" }}>+ Add address</span>
              }
              rawValue={asset.address ?? ""}
              placeholder="e.g. Burg. Hoffmanplein 12, Eindhoven"
              affordance
              displayStyle={{ minHeight: 22, flex: 1 }}
              inputStyle={{ fontSize: 11, fontFamily: "var(--mono)" }}
              onSave={async (raw) => {
                const v = raw.trim() || null;
                try {
                  const { asset: updated } = await patchField("address", v);
                  setAsset(updated);
                  fetchMutations();
                  return null;
                } catch (e) {
                  return e instanceof Error ? e.message : "Save failed";
                }
              }}
            />
          </div>

          {/* ROW 3: country · property_type · size_sqm */}
          <div className="flex items-center gap-1" style={{ marginTop: 6 }}>
            <InlineEdit
              display={
                <span className="font-mono text-dim" style={{ fontSize: 10, letterSpacing: "0.05em", textTransform: "uppercase" }}>
                  {asset.country ?? "??"}
                </span>
              }
              rawValue={asset.country ?? ""}
              placeholder="NL"
              affordance
              displayStyle={{ minHeight: 22 }}
              inputStyle={{ fontSize: 10, width: 52 }}
              onSave={async (raw) => {
                const v = raw.trim().toUpperCase().slice(0, 3) || null;
                return handleUpdate("country", v);
              }}
            />
            <span className="text-faint" style={{ fontSize: 10 }}>·</span>
            <select
              value={asset.property_type ?? ""}
              onChange={(e) => handleUpdate("property_type", e.target.value || null)}
              style={PROP_TYPE_SELECT_STYLE}
            >
              <option value="">type</option>
              <option value="house">House</option>
              <option value="apartment">Apartment</option>
              <option value="office">Office</option>
              <option value="land">Land</option>
              <option value="other">Other</option>
            </select>
            <span className="text-faint" style={{ fontSize: 10 }}>·</span>
            <InlineEdit
              display={
                <span className="font-mono text-dim" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                  {asset.size_sqm ? `${asset.size_sqm} m²` : "size"}
                </span>
              }
              rawValue={asset.size_sqm != null ? String(asset.size_sqm) : ""}
              placeholder="e.g. 120"
              affordance
              displayStyle={{ minHeight: 22 }}
              inputStyle={{ fontSize: 10, width: 72 }}
              onSave={async (raw) => {
                const t = raw.trim();
                if (t === "") return handleUpdate("size_sqm", null);
                const n = parseFloat(t);
                if (isNaN(n) || n <= 0) return "Must be a positive number";
                return handleUpdate("size_sqm", n);
              }}
            />
          </div>

          {/* Native currency — transparency, captured at add time, not editable */}
          <div className="font-mono text-faint" style={{ fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 5 }}>
            Native: {asset.currency ?? "EUR"}
          </div>
        </div>

        {/* Property value (editable) + Equity */}
        <div style={{ padding: "16px 22px 0", borderBottom: "1px solid var(--border)", marginBottom: 0 }}>
          <div className="flex items-center justify-between" style={{ paddingBottom: 16 }}>
            <div className="font-mono uppercase text-faint" style={{ fontSize: 10, letterSpacing: "0.2em" }}>
              Property value
            </div>
            <InlineEdit
              kind="money"
              displayCurrency={displayCurrency}
              display={
                <span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                  {formatMoney(asset.value, displayCurrency)}
                </span>
              }
              rawValue={String(asset.value)}
              placeholder="e.g. 350000"
              affordance
              displayStyle={{ minHeight: 28 }}
              inputStyle={{ fontSize: 14, fontWeight: 500, width: 120, textAlign: "right" }}
              onSave={async (raw) => {
                if (raw.trim() === "") return "";
                const n = parseFloat(raw);
                if (isNaN(n) || n <= 0) return "Must be a positive number";
                try {
                  const prevValue = asset.value;
                  const { asset: updated, mutation_id } = await patchField("value", n);
                  setAsset(updated);
                  fetchMutations();
                  if (prevValue > 0 && mutation_id) {
                    const delta = Math.abs(n - prevValue) / prevValue;
                    if (delta > 0.05) setPendingNote(mutation_id);
                  }
                  return null;
                } catch (e) {
                  return e instanceof Error ? e.message : "Save failed";
                }
              }}
            />
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
              mortgageBalance={asset.mortgage_balance!}
            />
          </div>
        )}

        {/* Context note prompt after significant value change */}
        {pendingNote && (
          <div style={{ padding: "0 22px" }}>
            <ContextNotePrompt mutationId={pendingNote} onDismiss={() => setPendingNote(null)} />
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
            <MortgageBlock asset={asset} onUpdate={handleUpdate} />
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

        {/* CTAs */}
        <div style={{ padding: "22px 22px 4px" }}>
          <button
            onClick={() => router.push("/chat")}
            className="font-mono text-center"
            style={{ width: "100%", padding: "11px 0", borderRadius: 12, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", background: "var(--accent)", color: "var(--bg)", border: "none", cursor: "pointer" }}
          >
            Discuss
          </button>
          <DeleteAssetButton asset={asset} />
        </div>

      </div>
    </div>
  );
}

