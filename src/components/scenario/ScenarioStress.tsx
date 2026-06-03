"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { stashHandoff } from "@/lib/scenario/handoff";

// Shock figures come from POST /api/scenarios/project (mode "shock") — nothing is
// recomputed client-side. Canonical Vitals shock severities.

interface ShockEntry { scope: "category"; key: string; factor: number }
interface AllocationSlice { category: string; valueUsd: number; pct: number }
interface Readout {
  netWorthUsd: number;
  allocationByCategory: AllocationSlice[];
  topSingleNameConcentrationPct: number | null;
  leverage: { ltvPct: number } | null;
}
interface ShockResp {
  mode: "shock";
  comparison: { current: Readout; scenario: Readout; deltas: { netWorthUsd: number } };
  assumptions: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets: "Public markets",
  reserves: "Reserves",
  crypto: "Crypto",
};
const CATEGORY_ORDER = ["markets", "property", "crypto", "reserves"];

// Canonical Vitals shock severities (equities −30%, crypto −50%, housing −15%).
const PRESETS: Array<{ id: string; label: string; shock: ShockEntry[] }> = [
  { id: "equities", label: "Equities −30%", shock: [{ scope: "category", key: "markets", factor: 0.7 }] },
  { id: "crypto", label: "Crypto −50%", shock: [{ scope: "category", key: "crypto", factor: 0.5 }] },
  { id: "housing", label: "Housing −15%", shock: [{ scope: "category", key: "property", factor: 0.85 }] },
  {
    id: "broad",
    label: "Broad downturn",
    shock: [
      { scope: "category", key: "markets", factor: 0.7 },
      { scope: "category", key: "crypto", factor: 0.5 },
      { scope: "category", key: "property", factor: 0.85 },
    ],
  },
];

interface ScenarioStressProps {
  displayCurrency: DisplayCurrency;
  isDesktop: boolean;
}

export function ScenarioStress({ displayCurrency, isDesktop }: ScenarioStressProps) {
  const router = useRouter();
  const m = useCallback((usd: number) => formatMoney(usd, "USD", displayCurrency), [displayCurrency]);
  const fmtPct = (n: number | null): string =>
    n == null ? "—" : new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + "%";

  const [activeId, setActiveId] = useState("broad");
  const [data, setData] = useState<ShockResp | null>(null);
  const [loading, setLoading] = useState(false);
  const [customCat, setCustomCat] = useState("markets");
  const [customDrop, setCustomDrop] = useState("20");
  const abortRef = useRef<AbortController | null>(null);

  const runShock = useCallback((shock: ShockEntry[], id: string) => {
    setActiveId(id);
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch("/api/scenarios/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "shock", shock }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ShockResp | null) => { if (d && d.comparison) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Default to the broad downturn so the panel renders immediately (bare fetch —
  // state is set only in the async callback, never synchronously in the effect).
  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    fetch("/api/scenarios/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "shock", shock: PRESETS[3].shock }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: ShockResp | null) => { if (d && d.comparison) setData(d); })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  function applyCustom() {
    const drop = Number(customDrop.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(drop) || drop <= 0 || drop > 100) return;
    const factor = 1 - drop / 100;
    runShock([{ scope: "category", key: customCat, factor }], "custom");
  }

  function discuss() {
    if (!data) return;
    const c = data.comparison.current, s = data.comparison.scenario;
    const dropUsd = s.netWorthUsd - c.netWorthUsd;
    const dropPct = c.netWorthUsd !== 0 ? (dropUsd / c.netWorthUsd) * 100 : 0;
    const stressedNw = m(s.netWorthUsd);
    const dropAbs = m(Math.abs(dropUsd));
    const dropPctStr = fmtPct(Math.abs(dropPct));
    const figures = [stressedNw, dropAbs, dropPctStr];
    let ltvLine = "";
    if (c.leverage && s.leverage) {
      const ltvCur = fmtPct(c.leverage.ltvPct);
      const ltvScn = fmtPct(s.leverage.ltvPct);
      figures.push(ltvCur, ltvScn);
      ltvLine = ` Mortgage LTV moves ${ltvCur} → ${ltvScn}.`;
    }
    const label = PRESETS.find((p) => p.id === activeId)?.label ?? "Custom shock";
    const description = `Stress test (${label}). Net worth falls to ${stressedNw}, a drop of ${dropAbs} (${dropPctStr}).${ltvLine} Illustrative shock, not a forecast.`;
    const fallback = `Under this stress, your net worth falls to ${stressedNw} — a drop of ${dropAbs} (${dropPctStr}).${ltvLine}`;
    stashHandoff({ userMessage: `Stress test: ${label}.`, description, figures, fallback });
    router.push(isDesktop ? "/" : "/chat");
  }

  const c = data?.comparison.current;
  const s = data?.comparison.scenario;
  const dropUsd = c && s ? s.netWorthUsd - c.netWorthUsd : 0;
  const dropPct = c && c.netWorthUsd !== 0 ? (dropUsd / c.netWorthUsd) * 100 : 0;
  const hasLeverage = !!(c?.leverage && s?.leverage);

  const curAlloc = new Map((c?.allocationByCategory ?? []).map((x) => [x.category, x]));
  const scnAlloc = new Map((s?.allocationByCategory ?? []).map((x) => [x.category, x]));
  const allocCats = CATEGORY_ORDER.filter((cat) => curAlloc.has(cat) || scnAlloc.has(cat));

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ ...eyebrow, marginTop: 14, marginBottom: 12 }}>Stress test</div>

      {/* Preset chips */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {PRESETS.map((p) => {
          const on = activeId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => runShock(p.shock, p.id)}
              style={{
                padding: "7px 13px",
                borderRadius: 999,
                border: `0.5px solid ${on ? "var(--accent)" : "var(--border)"}`,
                background: on ? "var(--accent-soft)" : "transparent",
                color: on ? "var(--accent-text)" : "var(--text-dim)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom shock — one category at a time */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
        <span style={{ fontSize: 12, color: "var(--text-faint)" }}>Custom:</span>
        <select value={customCat} onChange={(e) => setCustomCat(e.target.value)} style={{ ...textInput, width: 150 }}>
          {CATEGORY_ORDER.map((cat) => (
            <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>
          ))}
        </select>
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>−</span>
        <input
          value={customDrop}
          onChange={(e) => setCustomDrop(e.target.value)}
          inputMode="numeric"
          style={{ ...textInput, width: 64, textAlign: "right" }}
        />
        <span style={{ fontSize: 13, color: "var(--text-dim)" }}>%</span>
        <button onClick={applyCustom} style={{ ...textInput, cursor: "pointer", color: activeId === "custom" ? "var(--accent-text)" : "var(--text)", borderColor: activeId === "custom" ? "var(--accent)" : "var(--border)" }}>
          Apply
        </button>
      </div>

      {/* Comparison panel — present-mode language */}
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: "16px 16px 8px" }}>
        <div style={{ ...eyebrow, marginBottom: 14 }}>Current vs stressed</div>

        {/* Net worth drop */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Net worth after shock</div>
            <div className="font-serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--hero)", lineHeight: 1 }}>
              {s ? m(s.netWorthUsd) : "—"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div style={{ color: "var(--text-faint)" }}>{c ? m(c.netWorthUsd) : "—"} now</div>
            <div style={{ fontWeight: 500, color: "var(--negative-text)", marginTop: 2 }}>
              {s && c ? `−${m(Math.abs(dropUsd))} (${fmtPct(Math.abs(dropPct))})` : ""}
            </div>
          </div>
        </div>

        {/* LTV — the sharper read for leveraged property */}
        {hasLeverage && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", marginBottom: 12, borderRadius: 10, background: "var(--negative-soft)" }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--negative-text)" }}>Mortgage LTV</span>
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--negative-text)" }}>
              {fmtPct(c!.leverage!.ltvPct)} <span style={{ opacity: 0.6 }}>→</span> {fmtPct(s!.leverage!.ltvPct)}
            </span>
          </div>
        )}

        {/* Allocation after shock */}
        <div style={{ ...eyebrow, fontSize: 9, margin: "8px 0 6px" }}>Allocation after shock</div>
        {allocCats.map((cat) => (
          <div key={cat} style={statRow}>
            <span style={{ fontSize: 13, color: "var(--text)" }}>{CATEGORY_LABEL[cat] ?? cat}</span>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {fmtPct(curAlloc.get(cat)?.pct ?? 0)} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPct(scnAlloc.get(cat)?.pct ?? 0)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="font-serif" style={{ fontStyle: "italic", fontSize: 13, color: "var(--text-faint)", marginTop: 10 }}>
        Illustrative shock, not a forecast.
      </div>

      {loading && <div style={{ fontSize: 13, color: "var(--text-faint)", marginTop: 10 }}>Applying shock…</div>}

      {data && (
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
const statRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "7px 0",
  borderBottom: "0.5px solid var(--border)",
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
