"use client";

import { useState, useEffect, useMemo } from "react";
import type { Mutation } from "@/lib/supabase";
import { type PeriodKey, getPeriodLabel } from "@/lib/diary-utils";

interface PeriodHighlightProps {
  mutations: Mutation[];
  period: PeriodKey;
  customFrom: string;
  customTo: string;
}

export function PeriodHighlight({ mutations, period, customFrom, customTo }: PeriodHighlightProps) {
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const summaryKey = useMemo(() => mutations.map((m) => m.id).join(","), [mutations]);
  const periodLabel = getPeriodLabel(period, customFrom, customTo);

  useEffect(() => {
    if (mutations.length === 0) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    setSummary(null);
    setSummaryError(null);
    setSummaryLoading(true);

    fetch("/api/diary-summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        mutations: mutations.map((m) => ({
          action: m.action,
          asset_name: m.asset?.name ?? m.asset_name,
          before_value: m.before_value,
          after_value: m.after_value,
          currency: m.currency,
          occurred_at: m.occurred_at,
          personal_context: m.personal_context,
        })),
        startVal: 0,
        endVal: 0,
        periodLabel,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          if (r.status === 429) throw new Error("rate-limit");
          throw new Error("fetch-failed");
        }
        return r.json();
      })
      .then((d) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        setSummary(d.summary || null);
        setSummaryLoading(false);
      })
      .catch((err) => {
        clearTimeout(timeout);
        if (controller.signal.aborted) return;
        if (err.message === "rate-limit") {
          setSummaryError("Daily summary limit reached. Resets tomorrow.");
        } else if (err.message !== "AbortError") {
          setSummaryError("Couldn't generate summary right now.");
        }
        setSummaryLoading(false);
      });

    return () => { controller.abort(); clearTimeout(timeout); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summaryKey]);

  if (mutations.length === 0) return null;
  if (!summaryLoading && !summary && !summaryError) return null;

  return (
    <div
      className="bg-surface rounded-2xl border border-border mb-5"
      style={{ padding: "16px 20px" }}
    >
      <style>{`
        @keyframes volnarPulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }
      `}</style>

      {summaryLoading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
          <div
            style={{
              width: 32, height: 32, borderRadius: 9,
              background: "var(--accent-soft)",
              border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: "volnarPulse 1.6s ease-in-out infinite",
            }}
          >
            <span
              className="font-serif text-accent"
              style={{ fontSize: 18, fontWeight: 400, fontVariationSettings: "'opsz' 144", lineHeight: 1 }}
            >
              V
            </span>
          </div>
          <span
            style={{ fontSize: 12, color: "var(--text-faint)", letterSpacing: "0.04em" }}
          >
            Reading the period…
          </span>
        </div>
      ) : summaryError ? (
        <div style={{ fontSize: 13, color: "var(--text-faint)", lineHeight: 1.5, padding: "4px 0" }}>
          {summaryError}
        </div>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {(summary ?? "").split("\n").filter(l => l.trim()).map((line, i, arr) => (
            <li
              key={i}
              style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: i < arr.length - 1 ? 6 : 0 }}
            >
              {line.replace(/^•\s*/, "• ")}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
