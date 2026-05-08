"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { useLivePrice } from "@/lib/hooks";
import { PriceChart } from "@/components/PriceChart";
import { CryptoVolatilityBlock } from "@/components/asset-detail/CryptoVolatilityBlock";
import { InlineEdit } from "@/components/asset-detail/InlineEdit";
import { DeleteAssetButton } from "@/components/asset-detail/DeleteAssetButton";
import { ContextNotePrompt } from "@/components/asset-detail/ContextNotePrompt";
import { pctChange, formatDate, ACTION_STYLE, TYPE_LABEL, currencySymbol } from "@/lib/utils";
import { PriceDisplay } from "@/components/PriceDisplay";
import type { TradeableAsset, Mutation } from "@/lib/supabase";

interface Props {
  asset: TradeableAsset;
}


function fmtPrice(n: number): string {
  return n >= 1000
    ? n.toLocaleString("en", { maximumFractionDigits: 0 })
    : n.toFixed(2);
}

function monogram(asset: TradeableAsset): string {
  if (asset.symbol) {
    return asset.symbol.replace(/-[A-Z]+$/i, "").slice(0, 4).toUpperCase();
  }
  return asset.name.slice(0, 3).toUpperCase();
}

export function TradeableDetail({ asset: initialAsset }: Props) {
  const router = useRouter();
  const [asset, setAsset] = useState<TradeableAsset>(initialAsset);
  const { livePrice, livePrev } = useLivePrice(asset.symbol);
  const [mutations, setMutations] = useState<Mutation[]>([]);
  const [pendingNote, setPendingNote] = useState<string | null>(null);
  const supabase = createBrowserSupabase();

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

  /**
   * PATCH a single field. Returns the mutation_id on success or throws.
   * Caller is responsible for validation before calling.
   */
  const patchField = useCallback(async (
    field: string,
    value: unknown
  ): Promise<{ asset: TradeableAsset; mutation_id: string | null }> => {
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

  const currentValue = livePrice != null && asset.units
    ? Math.round(livePrice * asset.units)
    : asset.value;

  const dailyChg = pctChange(livePrice ?? undefined, livePrev ?? undefined);
  const dailyAbs =
    livePrice != null && livePrev != null && asset.units
      ? (livePrice - livePrev) * asset.units
      : null;
  const up = dailyChg != null && dailyChg >= 0;

  const totalReturn =
    livePrice != null && asset.buy_price && asset.buy_price > 0
      ? ((livePrice - asset.buy_price) / asset.buy_price) * 100
      : null;

  const sym = currencySymbol(asset.currency);

  const typeLabel = TYPE_LABEL[asset.type] ?? asset.type;
  const showCountry = asset.type !== "crypto";

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-[600px] mx-auto px-4 sm:px-6 pt-4 pb-32">

        {/* Back */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 font-mono text-dim mb-2"
          style={{ fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", paddingBottom: 8 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Back
        </button>

        {/* Header */}
        <div style={{ paddingBottom: 16 }}>
          <div className="flex items-center gap-3.5 mb-4">
            <div
              className="bg-surface border border-border flex items-center justify-center shrink-0 font-mono font-medium text-dim"
              style={{ width: 50, height: 50, borderRadius: 14, fontSize: 13 }}
            >
              {monogram(asset)}
            </div>
            <div>
              <div
                className="font-serif text-fg"
                style={{ fontSize: 22, fontWeight: 400, lineHeight: 1.2, fontVariationSettings: "'opsz' 144" }}
              >
                {asset.name}
              </div>
              <div
                className="font-mono text-dim mt-0.5 flex items-center gap-1"
                style={{ fontSize: 10, letterSpacing: "0.05em" }}
              >
                {showCountry && (
                  <>
                    <InlineEdit
                      display={
                        <span>{asset.country ?? <span style={{ color: "var(--text-faint)" }}>??</span>}</span>
                      }
                      rawValue={asset.country ?? ""}
                      placeholder="US"
                      displayStyle={{ minHeight: 28, fontSize: 10, letterSpacing: "0.05em" }}
                      inputStyle={{ fontSize: 10, width: 52, padding: "2px 6px", minHeight: 28 }}
                      onSave={async (raw) => {
                        const trimmed = raw.trim().toUpperCase().slice(0, 3);
                        const value = trimmed === "" ? null : trimmed;
                        if (value !== null && value.length > 3) return "Max 3 characters";
                        try {
                          const { asset: updated } = await patchField("country", value);
                          setAsset(updated);
                          fetchMutations();
                          return null;
                        } catch (e) {
                          return e instanceof Error ? e.message : "Save failed";
                        }
                      }}
                    />
                    <span style={{ color: "var(--text-faint)" }}>·</span>
                  </>
                )}
                {typeLabel}
              </div>
            </div>
          </div>

          {/* Price hero */}
          <div
            className="font-serif font-light text-fg"
            style={{ fontSize: 38, letterSpacing: "-0.03em", lineHeight: 1, fontVariationSettings: "'opsz' 144" }}
          >
            <PriceDisplay amount={currentValue} currency={asset.currency} />
          </div>

          {/* Change pill */}
          <div className="flex items-center gap-2.5 mt-3.5">
            {dailyChg !== null ? (
              <>
                <span
                  className="font-mono"
                  style={{
                    fontSize: 11, fontWeight: 500,
                    padding: "4px 8px", borderRadius: 6,
                    background: up ? "rgba(107,170,117,0.12)" : "rgba(201,122,110,0.12)",
                    color: up ? "var(--positive)" : "var(--negative)",
                  }}
                >
                  {up ? "+" : ""}{dailyChg.toFixed(2)}%
                </span>
                {dailyAbs !== null && (
                  <span className="text-dim" style={{ fontSize: 12 }}>
                    {dailyAbs >= 0 ? "+" : ""}{currencySymbol(asset.currency)}{Math.abs(dailyAbs).toLocaleString("en", { maximumFractionDigits: 0 })} today
                  </span>
                )}
              </>
            ) : (
              <span className="font-mono text-faint" style={{ fontSize: 11 }}>No live data</span>
            )}
          </div>
        </div>

        {/* Chart */}
        {asset.symbol && <PriceChart symbol={asset.symbol} defaultRange="3M" />}

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-2 py-4">
          {/* Units — inline-editable */}
          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div
              className="font-mono text-faint uppercase mb-2"
              style={{ fontSize: 9, letterSpacing: "0.16em" }}
            >
              Units
            </div>
            <InlineEdit
              display={
                <span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                  {asset.units != null ? asset.units.toLocaleString("en") : "—"}
                </span>
              }
              rawValue={asset.units != null ? String(asset.units) : ""}
              placeholder="e.g. 10.5"
              displayStyle={{ minHeight: 32 }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                if (raw.trim() === "") return "";      // silent revert
                const n = parseFloat(raw);
                if (isNaN(n) || n <= 0) return "Must be a positive number";
                try {
                  const prevUnits = asset.units ?? 0;
                  const { asset: updated, mutation_id } = await patchField("units", n);
                  setAsset(updated);
                  fetchMutations();
                  // Offer context note when value changes by more than 5%
                  if (prevUnits > 0 && mutation_id) {
                    const delta = Math.abs(n - prevUnits) / prevUnits;
                    if (delta > 0.05) setPendingNote(mutation_id);
                  }
                  return null;
                } catch (e) {
                  return e instanceof Error ? e.message : "Save failed";
                }
              }}
            />
          </div>

          {/* Avg buy price — inline-editable */}
          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div
              className="font-mono text-faint uppercase mb-2"
              style={{ fontSize: 9, letterSpacing: "0.16em" }}
            >
              Avg buy price
            </div>
            <InlineEdit
              display={
                <span className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
                  {asset.buy_price != null ? `€${fmtPrice(asset.buy_price)}` : "—"}
                </span>
              }
              rawValue={asset.buy_price != null ? String(asset.buy_price) : ""}
              placeholder="e.g. 150.00"
              displayStyle={{ minHeight: 32 }}
              inputStyle={{ fontSize: 14, fontWeight: 500 }}
              onSave={async (raw) => {
                const trimmed = raw.trim();
                const value = trimmed === "" ? null : parseFloat(trimmed);
                if (value !== null && (isNaN(value) || value < 0)) return "Must be a non-negative number";
                try {
                  const { asset: updated } = await patchField("buy_price", value);
                  setAsset(updated);
                  fetchMutations();
                  return null;
                } catch (e) {
                  return e instanceof Error ? e.message : "Save failed";
                }
              }}
            />
          </div>

          {/* Live price — read-only */}
          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div
              className="font-mono text-faint uppercase mb-2"
              style={{ fontSize: 9, letterSpacing: "0.16em" }}
            >
              Live price
            </div>
            <div className="font-mono" style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>
              {livePrice != null ? `€${fmtPrice(livePrice)}` : "—"}
            </div>
          </div>

          {/* Total return — read-only */}
          <div
            className="border border-border rounded-xl"
            style={{ background: "var(--surface)", padding: "12px 14px" }}
          >
            <div
              className="font-mono text-faint uppercase mb-2"
              style={{ fontSize: 9, letterSpacing: "0.16em" }}
            >
              Total return
            </div>
            <div
              className="font-mono"
              style={{
                fontSize: 14, fontWeight: 500,
                color: totalReturn == null ? "var(--text)" : totalReturn >= 0 ? "var(--positive)" : "var(--negative)",
              }}
            >
              {totalReturn != null ? `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%` : "—"}
            </div>
          </div>
        </div>

        {/* Context note prompt after significant units change */}
        {pendingNote && (
          <ContextNotePrompt
            mutationId={pendingNote}
            onDismiss={() => setPendingNote(null)}
          />
        )}

        {/* Crypto volatility */}
        <CryptoVolatilityBlock asset={asset} />

        {/* Recent activity */}
        {mutations.length > 0 && (
          <>
            <div
              className="font-serif text-fg"
              style={{ fontSize: 16, fontWeight: 400, margin: "18px 0 12px" }}
            >
              Recent activity
            </div>
            <div style={{ borderTop: "1px solid var(--border)" }}>
              {mutations.slice(0, 5).map((m) => {
                const style = ACTION_STYLE[m.action] ?? ACTION_STYLE.edit;
                const dateStr = m.occurred_at ?? m.recorded_at;
                return (
                  <div
                    key={m.id}
                    className="border-b border-border last:border-0"
                    style={{ padding: "14px 0" }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
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
                        style={{ fontSize: 17, fontWeight: 400, lineHeight: 1.3, marginBottom: 4 }}
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
                          fontSize: 12, lineHeight: 1.55,
                          borderLeft: "2px solid var(--border-strong)",
                          paddingLeft: 10,
                        }}
                      >
                        &quot;{m.personal_context}&quot;
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* CTAs */}
        <div className="pt-4 pb-2">
          <button
            onClick={() => router.push("/chat")}
            className="w-full font-mono text-center"
            style={{
              padding: "11px 0", borderRadius: 12,
              fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase",
              background: "var(--accent)", color: "var(--bg)",
              border: "none", cursor: "pointer",
            }}
          >
            Discuss
          </button>
          <DeleteAssetButton assetId={asset.id} />
        </div>

      </div>
    </div>
  );
}
