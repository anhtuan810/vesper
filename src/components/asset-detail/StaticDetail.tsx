"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { PriceDisplay } from "@/components/PriceDisplay";
import { BondBlock } from "@/components/asset-detail/BondBlock";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import { DeleteAssetButton } from "@/components/asset-detail/DeleteAssetButton";
import { ContextNotePrompt } from "@/components/asset-detail/ContextNotePrompt";
import { ACTION_STYLE, formatDate, TYPE_LABEL } from "@/lib/utils";
import { useDisplayCurrency } from "@/lib/hooks";
import { formatMoney } from "@/lib/money";
import type { StaticAsset, BondsAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: StaticAsset | BondsAsset;
}

export function StaticDetail({ asset: initialAsset }: Props) {
  const router = useRouter();
  const [asset, setAsset] = useState<StaticAsset | BondsAsset>(initialAsset);
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
  ): Promise<{ asset: StaticAsset | BondsAsset; mutation_id: string | null }> => {
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
  const monogram = asset.name.slice(0, 3).toUpperCase();

  const nameEqualsType = asset.name.toLowerCase() === asset.type.toLowerCase();
  const subLine = nameEqualsType
    ? (asset.currency ?? "")
    : [asset.country, TYPE_LABEL[asset.type] ?? asset.type].filter(Boolean).join(" · ");

  const showRate =
    (asset.type === "cash" || asset.type === "pension") &&
    asset.mortgage_rate != null;

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 pt-4 pb-32">

        {/* Back */}
        <button
          onClick={() => router.push('/')}
          className="flex items-center gap-2 font-mono text-dim mb-2"
          style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 8 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div style={{ paddingBottom: 24 }}>
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="bg-surface border border-border flex items-center justify-center shrink-0 font-mono font-medium text-dim"
              style={{ width: 50, height: 50, borderRadius: 14, fontSize: 13 }}
            >
              {monogram}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Name — inline-editable */}
              <InlineEdit
                display={
                  <span
                    className="font-serif text-fg"
                    style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.2, fontVariationSettings: "'opsz' 144" }}
                  >
                    {asset.name}
                  </span>
                }
                rawValue={asset.name}
                placeholder="e.g. Emergency fund"
                affordance
                displayStyle={{ minHeight: 32 }}
                inputStyle={{ fontSize: 18, fontFamily: "var(--serif)" }}
                onSave={async (raw) => {
                  const v = raw.trim();
                  if (!v) return "Name cannot be empty";
                  return handleUpdate("name", v);
                }}
              />
              {subLine && (
                <div className="font-mono text-dim mt-0.5" style={{ fontSize: 10, letterSpacing: "0.05em" }}>
                  {subLine}
                </div>
              )}
            </div>
          </div>

          {/* Balance hero — inline-editable */}
          <div className="font-mono uppercase text-faint" style={{ fontSize: 10, letterSpacing: "0.2em", marginBottom: 10 }}>
            Balance
          </div>
          <InlineEdit
            kind="money"
            displayCurrency={displayCurrency}
            display={
              <div
                className="font-serif font-light text-fg"
                style={{ fontSize: 38, letterSpacing: "-0.03em", lineHeight: 1, fontVariationSettings: "'opsz' 144" }}
              >
                <PriceDisplay amount={asset.value} displayCurrency={displayCurrency} />
              </div>
            }
            rawValue={String(asset.value)}
            placeholder="e.g. 25000"
            affordance
            displayStyle={{ minHeight: 44, display: "block" }}
            inputStyle={{ fontSize: 24, fontFamily: "var(--mono)", fontWeight: 500 }}
            onSave={async (raw) => {
              if (raw.trim() === "") return "";
              const n = parseFloat(raw);
              if (isNaN(n) || n < 0) return "Must be a non-negative number";
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

          {/* Currency — inline-editable pill */}
          <div className="flex items-center gap-2 mt-3">
            <span className="font-mono text-faint" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
              Currency
            </span>
            <InlineEdit
              display={
                <span
                  className="font-mono"
                  style={{ fontSize: 11, fontWeight: 500, padding: "3px 8px", borderRadius: 5, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-dim)" }}
                >
                  {asset.currency ?? "EUR"}
                </span>
              }
              rawValue={asset.currency ?? "EUR"}
              placeholder="EUR"
              affordance
              displayStyle={{ minHeight: 24 }}
              inputStyle={{ fontSize: 11, width: 64, fontFamily: "var(--mono)" }}
              onSave={async (raw) => {
                const v = raw.trim().toUpperCase();
                if (!v) return "Cannot be empty";
                return handleUpdate("currency", v);
              }}
            />
          </div>

          {/* Optional rate — cash and pension only */}
          {showRate && (
            <div className="flex items-center gap-2 mt-3">
              <span className="font-mono text-faint" style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>
                Rate
              </span>
              <span className="font-mono text-dim" style={{ fontSize: 12, fontWeight: 500 }}>
                {asset.mortgage_rate!.toFixed(2)}%
              </span>
            </div>
          )}
        </div>

        {/* Context note prompt after significant value change */}
        {pendingNote && (
          <ContextNotePrompt mutationId={pendingNote} onDismiss={() => setPendingNote(null)} />
        )}

        {/* Bond block — only for bonds, with inline edits */}
        {asset.type === "bonds" && (
          <BondBlock asset={asset as BondsAsset} onUpdate={handleUpdate} />
        )}

        {/* Activity */}
        <div style={{ marginTop: asset.type === "bonds" ? 28 : 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div className="font-serif text-fg" style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}>
              Activity
            </div>
            <span className="font-mono" style={{ fontSize: 11, color: "var(--accent)", letterSpacing: "0.04em" }}>ALL</span>
          </div>

          {mutations.length > 0 ? (
            <div style={{ borderTop: "1px solid var(--border)" }}>
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
            <div style={{ paddingBottom: 14 }}>
              <div className="font-mono text-faint" style={{ fontSize: 11 }}>No activity yet.</div>
            </div>
          )}
        </div>

        {/* CTAs */}
        <div style={{ paddingTop: 22 }}>
          <button
            onClick={() => router.push("/chat")}
            className="font-mono text-center"
            style={{ width: "100%", padding: "11px 0", borderRadius: 12, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", background: "var(--accent)", color: "var(--bg)", border: "none", cursor: "pointer" }}
          >
            Discuss
          </button>
          <DeleteAssetButton assetId={asset.id} />
        </div>

      </div>
    </div>
  );
}
