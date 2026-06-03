"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, getUsdRate } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import type { LiveAsset } from "@/lib/supabase";
import { stashHandoff } from "@/lib/scenario/handoff";
import { extractNumbers } from "@/lib/narrate/guardrail";
import { CounterfactualChart } from "@/components/scenario/cards/CounterfactualChart";

// Every figure comes from POST /api/scenarios/counterfactual — nothing is
// recomputed client-side. This component fetches, formats, and draws.

const TRADEABLE = new Set(["stocks", "etf", "crypto"]);
const SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£" };

interface CurvePoint { date: string; valueUsd: number }
interface DiaryEntry {
  occurred_at: string;
  action: string;
  after_units: number | null;
  personal_context: string | null;
  market_context: string | null;
}
interface CounterfactualResp {
  asset: { id: string; name: string; symbol: string; type: string };
  actualSeries: CurvePoint[];
  counterfactualSeries: CurvePoint[];
  contribution: number;
  assumptions: string[];
  diaryContext: DiaryEntry[];
}

const ACTION_LABEL: Record<string, string> = { add: "Added", edit: "Adjusted", remove: "Removed" };

function fmtDate(d: string): string {
  const [y, m, day] = d.slice(0, 10).split("-").map(Number);
  if (!y) return d;
  return new Date(y, (m ?? 1) - 1, day ?? 1).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

interface ScenarioLookbackProps {
  realAssets: LiveAsset[];
  displayCurrency: DisplayCurrency;
  isDesktop: boolean;
}

export function ScenarioLookback({ realAssets, displayCurrency, isDesktop }: ScenarioLookbackProps) {
  const router = useRouter();
  const rate = getUsdRate(displayCurrency);
  const sym = SYMBOL[displayCurrency] ?? "€";
  const m = useCallback((usd: number) => formatMoney(usd, "USD", displayCurrency), [displayCurrency]);
  const toDisplayNum = useCallback((usd: number) => usd * rate, [rate]);

  const tradeables = realAssets.filter((a) => TRADEABLE.has(a.type));
  const [selectedId, setSelectedId] = useState<string>(tradeables[0]?.id ?? "");
  const [data, setData] = useState<CounterfactualResp | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    const ctrl = new AbortController();
    fetch("/api/scenarios/counterfactual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ asset_id: selectedId, range: "All" }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: CounterfactualResp | null) => { if (d) setData(d); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [selectedId]);

  // Show only the selected asset's result; while a new selection loads, the
  // previous asset's data is suppressed (avoids synchronous setState in effect).
  const view = data && data.asset.id === selectedId ? data : null;
  const loading = !!selectedId && !view;

  if (tradeables.length === 0) {
    return (
      <div style={{ paddingTop: 20 }}>
        <div className="font-serif" style={{ fontStyle: "italic", fontSize: 14.5, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Look back works with tradeable positions — stocks, ETFs, crypto. You don&apos;t hold any yet.
        </div>
      </div>
    );
  }

  const contribution = view?.contribution ?? 0;
  const positive = contribution >= 0;

  // Hand the computed contribution + recorded reasons to the assistant. Allowed
  // figures = the contribution plus any numbers in the user's own notes/dates, so
  // the narration can quote them verbatim without tripping the guardrail.
  function discuss() {
    if (!view) return;
    const amt = m(Math.abs(view.contribution));
    const verb = view.contribution >= 0 ? "added" : "cost";
    const diaryContext = view.diaryContext
      .filter((d) => d.personal_context)
      .map((d) => ({ date: fmtDate(d.occurred_at), note: d.personal_context as string, market: d.market_context ?? undefined }));
    const figures = [amt];
    for (const d of diaryContext) {
      figures.push(...extractNumbers(d.date), ...extractNumbers(d.note));
      if (d.market) figures.push(...extractNumbers(d.market));
    }
    const description = `Look back at ${view.asset.name}: it has ${verb} ${amt} versus the capital deployed (gain or loss; the capital is kept as cash, not redeployed).`;
    const fallback = `${view.asset.name} has ${verb} ${amt} ${view.contribution >= 0 ? "to your net worth since you bought it." : "since you bought it."}`;
    stashHandoff({ userMessage: `What did ${view.asset.name} contribute?`, description, figures, fallback, diaryContext });
    router.push(isDesktop ? "/" : "/chat");
  }

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ ...eyebrow, marginTop: 14, marginBottom: 12 }}>Look back</div>

      {/* Position selector — tradeables only */}
      <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ ...textInput, marginBottom: 16, minWidth: 220 }}>
        {tradeables.map((a) => (
          <option key={a.id} value={a.id}>{a.name}{a.symbol ? ` · ${a.symbol}` : ""}</option>
        ))}
      </select>

      {/* Actual vs counterfactual curves */}
      <CounterfactualChart
        actual={(view?.actualSeries ?? []).map((p) => ({ t: Date.parse(p.date), v: toDisplayNum(p.valueUsd) }))}
        counterfactual={(view?.counterfactualSeries ?? []).map((p) => ({ t: Date.parse(p.date), v: toDisplayNum(p.valueUsd) }))}
        symbol={sym}
      />

      {/* Sign-aware contribution figure */}
      {view && (
        <div className="font-serif" style={{ fontSize: 22, lineHeight: 1.4, letterSpacing: "-0.01em", color: "var(--text)", marginTop: 18 }}>
          {view.asset.name} has {positive ? "added" : "cost"}{" "}
          <span style={{ fontWeight: 600, color: positive ? "var(--positive-text)" : "var(--negative-text)" }}>
            {m(Math.abs(contribution))}
          </span>{" "}
          {positive ? "to your net worth since you bought it." : "since you bought it."}
        </div>
      )}

      {/* Legend */}
      {view && (
        <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 12, color: "var(--text-dim)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 2, background: "var(--accent)", display: "inline-block" }} /> Actual
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 14, height: 0, borderTop: "1.5px dashed var(--text-faint)", display: "inline-block" }} /> Without {view.asset.name}
          </span>
        </div>
      )}

      {loading && <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 14 }}>Reconstructing…</div>}

      {/* Assumptions */}
      {view && (
        <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12 }}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Assumptions</div>
          {view.assumptions.map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 3 }}>{a}</div>
          ))}
          <div className="font-serif" style={{ fontStyle: "italic", fontSize: 13, color: "var(--text-faint)", marginTop: 8 }}>Estimate.</div>
        </div>
      )}

      {/* Diary pairing — the number next to the recorded reason, in the user's own words */}
      {view && (
        <div style={{ marginTop: 18 }}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>What you recorded</div>
          {view.diaryContext.length > 0 ? (
            view.diaryContext.map((d, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "0.5px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-faint)", letterSpacing: "0.02em" }}>
                  {fmtDate(d.occurred_at)} · {ACTION_LABEL[d.action] ?? d.action}
                  {typeof d.after_units === "number" ? ` · ${d.after_units} units` : ""}
                </div>
                {d.personal_context && (
                  <div style={{ fontSize: 13.5, color: "var(--text)", lineHeight: 1.5, marginTop: 3 }}>{d.personal_context}</div>
                )}
                {d.market_context && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.45, marginTop: 3 }}>{d.market_context}</div>
                )}
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--text-faint)" }}>No recorded notes for this position.</div>
          )}
        </div>
      )}

      {view && (
        <button onClick={discuss} style={{ marginTop: 14, padding: "8px 0", background: "transparent", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: "0.01em" }}>
          Discuss with assistant →
        </button>
      )}
    </div>
  );
}

const eyebrow: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};
const textInput: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--border)",
  borderRadius: 8,
  background: "var(--bg)",
  color: "var(--text)",
  fontSize: 13,
  fontFamily: "var(--font-sans)",
  outline: "none",
};
