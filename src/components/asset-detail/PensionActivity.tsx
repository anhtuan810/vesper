"use client";

import { formatDate } from "@/lib/utils";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import { isIncomePension } from "@/lib/pension";
import type { StaticAsset, Mutation } from "@/lib/supabase";

// Pension Activity list — extracted from StaticDetail so pension no longer
// depends on it. Pensions are "Added"/"Recorded", never "Bought"; income
// pensions phrase the amount as "€X / year".
export function PensionActivityList({
  asset,
  mutations,
  displayCurrency,
}: {
  asset: StaticAsset;
  mutations: Mutation[];
  displayCurrency: DisplayCurrency;
}) {
  if (mutations.length === 0) return null;
  const income = isIncomePension(asset);

  return (
    <div style={{ marginTop: 26 }}>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "var(--tracking-label)", textTransform: "uppercase", color: "var(--text-faint)", marginBottom: 12 }}>
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
            const amount = formatMoney(m.after_value, mCur, displayCurrency);
            const suffix = income ? " / year" : "";
            delta = `Added ${amount}${suffix}`; deltaNeutral = true;
          } else if (m.action === "add" && m.before_value != null) {
            const d = m.after_value - m.before_value;
            delta = `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), mCur, displayCurrency)}`; deltaPositive = d >= 0;
          } else if (m.action === "edit" && m.before_value != null) {
            const d = m.after_value - m.before_value;
            delta = `${d >= 0 ? "+" : "−"}${formatMoney(Math.abs(d), mCur, displayCurrency)}`; deltaPositive = d >= 0;
          } else {
            const amount = formatMoney(m.after_value, mCur, displayCurrency);
            delta = income ? `${amount} / year` : amount; deltaNeutral = true;
          }
        }

        return (
          <div key={m.id} style={{ display: "flex", gap: 14, padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
            <div style={{ fontSize: 13, color: "var(--text-faint)", fontFeatureSettings: '"tnum" 1', width: 60, flexShrink: 0, paddingTop: 1 }}>
              {dateStr ? formatDate(dateStr) : "—"}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {delta && (
                <div style={{
                  fontSize: 15,
                  fontWeight: 500,
                  color: deltaNeutral ? "var(--text)" : deltaPositive ? "var(--positive-text)" : "var(--negative-text)",
                  marginBottom: 2,
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
  );
}
