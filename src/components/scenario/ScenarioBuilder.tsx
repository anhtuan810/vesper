"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import type { LiveAsset } from "@/lib/supabase";
import type { Comparison, Modification, Readout } from "@/lib/scenario/engine";
import { stashHandoff } from "@/lib/scenario/handoff";

// Semantic category map — mirror of CATEGORY_MAP in src/components/PortfolioTab.tsx
// (component-local there; kept in sync by hand).
const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks: "markets",
  etf: "markets",
  crypto: "crypto",
  cash: "reserves",
  pension: "reserves",
  bonds: "reserves",
  gold: "reserves",
  other: "reserves",
};
const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets: "Public markets",
  reserves: "Reserves",
  crypto: "Crypto",
};
const CATEGORY_ORDER = ["markets", "property", "crypto", "reserves"];

// Hypothetical adds are value-based; each category maps to a representative type
// so the engine's CATEGORY_MAP files it under the right bucket.
const ADD_CATEGORIES: Array<{ key: string; label: string; type: string }> = [
  { key: "markets", label: "Public markets", type: "etf" },
  { key: "crypto", label: "Crypto", type: "crypto" },
  { key: "reserves", label: "Reserves", type: "cash" },
  { key: "property", label: "Property", type: "real_estate" },
];

interface SandboxAsset {
  id: string;
  name: string;
  type: string;
  value: number; // native currency
  currency: string;
}

interface ScenarioBuilderProps {
  realAssets: LiveAsset[];
  displayCurrency: DisplayCurrency;
  userId: string | undefined;
  isDesktop: boolean;
}

const eyebrowStyle: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
};

function buildModifications(real: SandboxAsset[], sandbox: SandboxAsset[]): Modification[] {
  const mods: Modification[] = [];
  const realById = new Map(real.map((a) => [a.id, a]));
  const sandboxIds = new Set(sandbox.map((a) => a.id));
  for (const r of real) {
    if (!sandboxIds.has(r.id)) mods.push({ kind: "remove", assetId: r.id });
  }
  for (const s of sandbox) {
    const r = realById.get(s.id);
    if (r) {
      if (s.value !== r.value) mods.push({ kind: "setValue", assetId: s.id, nativeValue: s.value });
    } else {
      mods.push({ kind: "addByValue", name: s.name, type: s.type, currency: s.currency, nativeValue: s.value });
    }
  }
  return mods;
}

export function ScenarioBuilder({ realAssets, displayCurrency, userId, isDesktop }: ScenarioBuilderProps) {
  const router = useRouter();
  // Clone the real portfolio once, on mount. `real` is the frozen baseline used
  // to diff modifications; `sandbox` is the editable working copy. Real data is
  // never touched.
  const real = useMemo<SandboxAsset[]>(
    () => realAssets.map((a) => ({ id: a.id, name: a.name, type: a.type, value: a.value, currency: a.currency || "USD" })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [sandbox, setSandbox] = useState<SandboxAsset[]>(real);

  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [usdRates, setUsdRates] = useState<Record<string, number> | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addCat, setAddCat] = useState("markets");
  const [addValue, setAddValue] = useState("");

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // ── USD-bridge conversion (rates come from the compute route) ──────────────
  const toUsdR = useCallback((amt: number, cur: string) => (cur === "USD" ? amt : usdRates?.[cur] ? amt / usdRates[cur] : amt), [usdRates]);
  const fromUsdR = useCallback((usd: number, cur: string) => (cur === "USD" ? usd : usdRates?.[cur] ? usd * usdRates[cur] : usd), [usdRates]);
  const nativeToDisplay = useCallback((n: number, cur: string) => fromUsdR(toUsdR(n, cur), displayCurrency), [toUsdR, fromUsdR, displayCurrency]);
  const displayToNative = useCallback((d: number, cur: string) => fromUsdR(toUsdR(d, displayCurrency), cur), [toUsdR, fromUsdR, displayCurrency]);

  // ── Debounced compute: diff sandbox vs real → POST compute → readouts ──────
  useEffect(() => {
    const mods = buildModifications(real, sandbox);
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/scenarios/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modifications: mods }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (res.ok && data.comparison) {
          setComparison(data.comparison as Comparison);
          if (data.usdRates) setUsdRates(data.usdRates as Record<string, number>);
        }
      } catch {
        // aborted or transient — keep last good readout
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [sandbox, real]);

  const m = useCallback((usd: number) => formatMoney(usd, "USD", displayCurrency), [displayCurrency]);
  const fmtPct = (n: number | null): string =>
    n == null ? "—" : new Intl.NumberFormat("nl-NL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n) + "%";

  // ── Editing handlers ────────────────────────────────────────────────────────
  function startEdit(a: SandboxAsset) {
    setEditingId(a.id);
    setEditingValue(String(Math.round(nativeToDisplay(a.value, a.currency))));
  }
  function commitEdit() {
    if (editingId == null) return;
    const parsed = Number(editingValue.replace(/[^\d.-]/g, ""));
    if (Number.isFinite(parsed) && parsed >= 0) {
      const target = sandbox.find((a) => a.id === editingId);
      if (target) {
        const native = displayToNative(parsed, target.currency);
        setSandbox((prev) => prev.map((a) => (a.id === editingId ? { ...a, value: native } : a)));
      }
    }
    setEditingId(null);
    setEditingValue("");
  }
  function removeAsset(id: string) {
    setSandbox((prev) => prev.filter((a) => a.id !== id));
  }
  function commitAdd() {
    const parsed = Number(addValue.replace(/[^\d.-]/g, ""));
    const name = addName.trim();
    const cat = ADD_CATEGORIES.find((c) => c.key === addCat) ?? ADD_CATEGORIES[0];
    if (!name || !Number.isFinite(parsed) || parsed <= 0) return;
    setSandbox((prev) => [
      ...prev,
      { id: `new-${Date.now()}-${prev.length}`, name, type: cat.type, value: parsed, currency: displayCurrency },
    ]);
    setAddName("");
    setAddValue("");
    setAddOpen(false);
  }

  async function saveScenario() {
    const name = saveName.trim();
    if (!name || saving || !userId) return;
    setSaving(true);
    try {
      const res = await fetch("/api/scenarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, assets_snapshot: sandbox }),
      });
      if (res.ok) {
        setSaveOpen(false);
        setSaveName("");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  }

  // Hand the computed comparison to the assistant for narration (figures only).
  function discuss() {
    if (!comparison) return;
    const c = comparison.current, s = comparison.scenario, d = comparison.deltas;
    const nw = m(s.netWorthUsd);
    const delta = m(Math.abs(d.netWorthUsd));
    const sign = d.netWorthUsd >= 0 ? "+" : "−";
    const conCur = fmtPct(c.topSingleNameConcentrationPct);
    const conScn = fmtPct(s.topSingleNameConcentrationPct);
    const figures = [nw, delta, conCur, conScn];
    const description = `Adjusted-portfolio scenario. Net worth ${nw} (${sign}${delta} versus current). Single-name concentration ${conCur} → ${conScn}.`;
    const fallback = `In this scenario your net worth is ${nw}, ${sign}${delta} versus today, with single-name concentration moving from ${conCur} to ${conScn}.`;
    stashHandoff({ userMessage: "Talk me through the adjustments I sketched.", description, figures, fallback });
    router.push(isDesktop ? "/" : "/chat");
  }

  // ── Grouping ──────────────────────────────────────────────────────────────
  function groupBy(list: SandboxAsset[]): Array<{ category: string; label: string; items: SandboxAsset[] }> {
    const byCat: Record<string, SandboxAsset[]> = {};
    for (const a of list) {
      const cat = CATEGORY_MAP[a.type] ?? "reserves";
      (byCat[cat] ??= []).push(a);
    }
    return CATEGORY_ORDER.filter((c) => byCat[c]?.length).map((category) => ({
      category,
      label: CATEGORY_LABEL[category] ?? category,
      items: [...byCat[category]].sort((a, b) => b.value - a.value),
    }));
  }

  // ── Render pieces ───────────────────────────────────────────────────────────
  const valueText = (a: SandboxAsset) => formatMoney(a.value, a.currency, displayCurrency);

  function readonlyColumn() {
    const groups = groupBy(real);
    return (
      <div style={{ opacity: 0.55 }}>
        <div style={{ ...eyebrowStyle, marginBottom: 12 }}>Current</div>
        {groups.map((g) => (
          <div key={g.category} style={{ marginBottom: 16 }}>
            <div style={{ ...eyebrowStyle, fontSize: 9, marginBottom: 6, color: "var(--text-faint)" }}>{g.label}</div>
            {g.items.map((a) => (
              <div key={a.id} style={rowStyle}>
                <span style={nameStyle}>{a.name}</span>
                <span style={valStyle}>{valueText(a)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  function editableColumn() {
    const groups = groupBy(sandbox);
    return (
      <div>
        <div style={{ ...eyebrowStyle, marginBottom: 12, color: "var(--accent-text)" }}>Scenario</div>
        {groups.map((g) => (
          <div key={g.category} style={{ marginBottom: 16 }}>
            <div style={{ ...eyebrowStyle, fontSize: 9, marginBottom: 6 }}>{g.label}</div>
            {g.items.map((a) => (
              <div key={a.id} style={rowStyle}>
                <span style={{ ...nameStyle, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                {editingId === a.id ? (
                  <input
                    autoFocus
                    value={editingValue}
                    onChange={(e) => setEditingValue(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setEditingId(null); setEditingValue(""); } }}
                    inputMode="numeric"
                    style={editInputStyle}
                  />
                ) : (
                  <button onClick={() => startEdit(a)} style={editValueButtonStyle} aria-label={`Edit ${a.name} value`}>
                    {valueText(a)}
                  </button>
                )}
                <button onClick={() => removeAsset(a.id)} aria-label={`Remove ${a.name}`} style={removeButtonStyle}>×</button>
              </div>
            ))}
          </div>
        ))}

        {/* Add hypothetical position */}
        {addOpen ? (
          <div style={{ marginTop: 8, padding: 12, border: "0.5px solid var(--border)", borderRadius: 12, background: "var(--surface)" }}>
            <input
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              placeholder="Name"
              maxLength={60}
              style={{ ...textInputStyle, marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <select value={addCat} onChange={(e) => setAddCat(e.target.value)} style={{ ...textInputStyle, flex: 1 }}>
                {ADD_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
              <input
                value={addValue}
                onChange={(e) => setAddValue(e.target.value)}
                placeholder={`Value (${displayCurrency})`}
                inputMode="numeric"
                style={{ ...textInputStyle, flex: 1 }}
              />
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={commitAdd} style={primaryButtonStyle}>Add</button>
              <button onClick={() => { setAddOpen(false); setAddName(""); setAddValue(""); }} style={textButtonStyle}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)} style={{ ...textButtonStyle, marginTop: 4, color: "var(--accent-text)" }}>
            + Add hypothetical position
          </button>
        )}
      </div>
    );
  }

  function comparisonPanel() {
    const c: Readout | undefined = comparison?.current;
    const s: Readout | undefined = comparison?.scenario;
    const d = comparison?.deltas;

    const allocCats = (() => {
      const set = new Set<string>();
      c?.allocationByCategory.forEach((x) => set.add(x.category));
      s?.allocationByCategory.forEach((x) => set.add(x.category));
      return CATEGORY_ORDER.filter((cat) => set.has(cat));
    })();
    const curAlloc = new Map((c?.allocationByCategory ?? []).map((x) => [x.category, x]));
    const scnAlloc = new Map((s?.allocationByCategory ?? []).map((x) => [x.category, x]));

    const nwDelta = d?.netWorthUsd ?? 0;
    const nwColor = nwDelta >= 0 ? "var(--positive-text)" : "var(--negative-text)";

    return (
      <div style={{ background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 14, padding: "16px 16px 8px" }}>
        <div style={{ ...eyebrowStyle, marginBottom: 14 }}>Comparison</div>

        {/* Net worth */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>Net worth</div>
            <div className="font-serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--hero)", lineHeight: 1 }}>
              {s ? m(s.netWorthUsd) : "—"}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13 }}>
            <div style={{ color: "var(--text-faint)" }}>{c ? m(c.netWorthUsd) : "—"} now</div>
            <div style={{ fontWeight: 500, color: nwColor, marginTop: 2 }}>
              {nwDelta >= 0 ? "+" : "−"}{m(Math.abs(nwDelta))}
            </div>
          </div>
        </div>

        {/* Single-name concentration */}
        <div style={statRowStyle}>
          <span style={{ fontSize: 13, color: "var(--text)" }}>Single-name concentration</span>
          <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
            {fmtPct(c?.topSingleNameConcentrationPct ?? null)} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
            <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPct(s?.topSingleNameConcentrationPct ?? null)}</span>
          </span>
        </div>

        {/* Allocation by category */}
        <div style={{ ...eyebrowStyle, fontSize: 9, margin: "14px 0 6px" }}>Allocation by category</div>
        {allocCats.map((cat) => (
          <div key={cat} style={statRowStyle}>
            <span style={{ fontSize: 13, color: "var(--text)" }}>{CATEGORY_LABEL[cat] ?? cat}</span>
            <span style={{ fontSize: 13, color: "var(--text-dim)" }}>
              {fmtPct(curAlloc.get(cat)?.pct ?? 0)} <span style={{ color: "var(--text-faint)" }}>→</span>{" "}
              <span style={{ color: "var(--text)", fontWeight: 500 }}>{fmtPct(scnAlloc.get(cat)?.pct ?? 0)}</span>
            </span>
          </div>
        ))}
        {comparison && (
          <button onClick={discuss} style={discussButtonStyle}>Discuss with assistant →</button>
        )}
      </div>
    );
  }

  function saveControls() {
    if (saved) return <span style={{ fontSize: 13, color: "var(--positive-text)" }}>Saved</span>;
    if (saveOpen) {
      return (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            autoFocus
            value={saveName}
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") saveScenario(); if (e.key === "Escape") setSaveOpen(false); }}
            placeholder="Name this scenario"
            maxLength={120}
            style={{ ...textInputStyle, width: 200 }}
          />
          <button onClick={saveScenario} disabled={saving || !saveName.trim()} style={primaryButtonStyle}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setSaveOpen(false)} style={textButtonStyle}>Cancel</button>
        </div>
      );
    }
    return <button onClick={() => setSaveOpen(true)} style={primaryButtonStyle}>Save scenario</button>;
  }

  // ── Layout ──────────────────────────────────────────────────────────────────
  const header = (
    <div style={{ paddingTop: 32, marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div className="font-serif" style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.026em", color: "var(--hero)", lineHeight: 1 }}>
          Scenario
        </div>
        {saveControls()}
      </div>
      <div className="font-serif" style={{ fontStyle: "italic", fontSize: 14.5, color: "var(--text-dim)", marginTop: 10 }}>
        Sandbox — your real portfolio is unchanged.
      </div>
    </div>
  );

  if (isDesktop) {
    return (
      <div>
        {header}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginBottom: 24 }}>
          {readonlyColumn()}
          {editableColumn()}
        </div>
        {comparisonPanel()}
      </div>
    );
  }

  // Mobile: comparison first, then the editable scenario list, then sticky save.
  return (
    <div style={{ paddingBottom: 80 }}>
      {header}
      <div style={{ marginBottom: 24 }}>{comparisonPanel()}</div>
      {editableColumn()}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "12px 20px calc(12px + env(safe-area-inset-bottom))",
          background: "var(--bg)",
          borderTop: "0.5px solid var(--border)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        {saveControls()}
      </div>
    </div>
  );
}

// ── Shared inline styles ────────────────────────────────────────────────────
const rowStyle: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "0.5px solid var(--border)" };
const nameStyle: React.CSSProperties = { fontSize: 14, color: "var(--text)" };
const valStyle: React.CSSProperties = { marginLeft: "auto", fontSize: 14, color: "var(--text)", fontVariantNumeric: "tabular-nums" };
const editValueButtonStyle: React.CSSProperties = { marginLeft: "auto", fontSize: 14, color: "var(--text)", background: "transparent", border: "none", borderBottom: "1px dashed var(--border-strong)", cursor: "pointer", padding: "0 0 1px", fontVariantNumeric: "tabular-nums" };
const editInputStyle: React.CSSProperties = { marginLeft: "auto", width: 110, textAlign: "right", fontSize: 14, padding: "4px 6px", border: "1px solid var(--accent)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", outline: "none" };
const removeButtonStyle: React.CSSProperties = { flexShrink: 0, width: 22, height: 22, borderRadius: "50%", border: "none", background: "transparent", color: "var(--text-faint)", cursor: "pointer", fontSize: 16, lineHeight: "20px" };
const statRowStyle: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "7px 0", borderBottom: "0.5px solid var(--border)" };
const textInputStyle: React.CSSProperties = { width: "100%", padding: "8px 10px", border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg)", color: "var(--text)", fontSize: 13, fontFamily: "var(--font-sans)", outline: "none" };
const primaryButtonStyle: React.CSSProperties = { padding: "8px 16px", background: "var(--accent)", color: "#fff", border: "none", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", letterSpacing: "0.01em" };
const textButtonStyle: React.CSSProperties = { padding: "8px 10px", background: "transparent", color: "var(--text-dim)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer" };
const discussButtonStyle: React.CSSProperties = { marginTop: 14, padding: "8px 0", background: "transparent", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: "0.01em" };
