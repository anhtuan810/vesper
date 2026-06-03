"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { formatMoney, getUsdRate } from "@/lib/money";
import type { DisplayCurrency } from "@/lib/money";
import { stashHandoff } from "@/lib/scenario/handoff";

// All projected figures come from POST /api/scenarios/project — nothing is
// recomputed or projected client-side. This component only fetches, formats,
// and draws the route's numbers.

const HORIZONS = [5, 10, 20, 30];
const SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£" };
type ContribFreq = "monthly" | "yearly" | "none";

interface TrajectoryResp {
  startUsd: number;
  rate: number;
  horizonYears: number;
  trajectory: { low: number; mid: number; high: number; assumptions: string[] };
  assumptions: string[];
}
interface SolveResp {
  startUsd: number;
  targetUsd: number;
  date: string;
  prefilledFromGoal: boolean;
  rate: number;
  solve: { amountPerPeriod: number; frequency: string; horizonYears: number; rate: number; assumptions: string[] };
  assumptions: string[];
}

function niceCeil(v: number): number {
  if (v <= 0) return 0;
  const step = v < 10_000 ? 1_000 : v < 100_000 ? 5_000 : v < 1_000_000 ? 25_000 : v < 10_000_000 ? 100_000 : 1_000_000;
  return Math.ceil(v / step) * step;
}

interface ScenarioProjectionProps {
  displayCurrency: DisplayCurrency;
  isDesktop: boolean;
}

export function ScenarioProjection({ displayCurrency, isDesktop }: ScenarioProjectionProps) {
  const router = useRouter();
  const rate = getUsdRate(displayCurrency);
  const sym = SYMBOL[displayCurrency] ?? "€";
  const m = useCallback((usd: number) => formatMoney(usd, "USD", displayCurrency), [displayCurrency]);
  const toDisplayNum = useCallback((usd: number) => usd * rate, [rate]);
  const parseToUsd = useCallback((s: string) => {
    const n = Number(s.replace(/[^\d.-]/g, ""));
    return Number.isFinite(n) ? n / (rate || 1) : 0;
  }, [rate]);

  // ── Trajectory controls + result ──────────────────────────────────────────
  const [horizonYears, setHorizonYears] = useState(10);
  const [contribAmount, setContribAmount] = useState("");
  const [contribFreq, setContribFreq] = useState<ContribFreq>("none");
  const [traj, setTraj] = useState<TrajectoryResp | null>(null);

  // ── Historical net worth (for the curve before "today") ───────────────────
  const [history, setHistory] = useState<Array<{ date: string; total_value: number }>>([]);
  useEffect(() => {
    let alive = true;
    fetch("/api/snapshots?range=All")
      .then((r) => r.json())
      .then(({ data }) => { if (alive) setHistory((data ?? []) as Array<{ date: string; total_value: number }>); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Debounced trajectory fetch on control change.
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      const contribution =
        contribFreq === "none"
          ? undefined
          : { amount: parseToUsd(contribAmount), frequency: contribFreq === "yearly" ? "annual" : "monthly" };
      try {
        const res = await fetch("/api/scenarios/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "trajectory", horizonYears, contribution }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (res.ok) setTraj(data as TrajectoryResp);
      } catch { /* aborted/transient */ }
    }, 300);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [horizonYears, contribAmount, contribFreq, parseToUsd]);

  // ── Solve-for ──────────────────────────────────────────────────────────────
  const [targetInput, setTargetInput] = useState("");
  const [yearInput, setYearInput] = useState("");
  const [solveFreq, setSolveFreq] = useState<"monthly" | "yearly">("monthly");
  const [solve, setSolve] = useState<SolveResp | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Prefill from an existing goal once on mount (route returns it when present).
  useEffect(() => {
    let alive = true;
    fetch("/api/scenarios/project", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "solve", frequency: "monthly" }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SolveResp | null) => {
        if (!alive || !data) return;
        setSolve(data);
        if (data.prefilledFromGoal) {
          setTargetInput(String(Math.round(toDisplayNum(data.targetUsd))));
          setYearInput(data.date.slice(0, 4));
          setPrefilled(true);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute solve when the user edits target / year / frequency.
  useEffect(() => {
    if (!targetInput.trim() || !/^\d{4}$/.test(yearInput.trim())) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/scenarios/project", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "solve",
            targetUsd: parseToUsd(targetInput),
            date: `${yearInput.trim()}-12-31`,
            frequency: solveFreq === "yearly" ? "annual" : "monthly",
          }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        if (res.ok) setSolve(data as SolveResp);
      } catch { /* aborted/transient */ }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [targetInput, yearInput, solveFreq, parseToUsd]);

  // Hand the computed projection to the assistant for narration (figures only).
  function discuss() {
    if (!traj) return;
    const low = m(traj.trajectory.low), mid = m(traj.trajectory.mid), high = m(traj.trajectory.high);
    const rateStr = `${(traj.rate * 100).toFixed(1)}%`;
    const horizonStr = `${horizonYears}`;
    const figures = [low, mid, high, rateStr, horizonStr];
    const description = `Forward projection over ${horizonStr} years at a derived ${rateStr} nominal rate. Net worth midpoint ${mid}, range ${low} to ${high}.`;
    const fallback = `Over ${horizonStr} years at ${rateStr}, your net worth projects to ${mid} at the midpoint, ranging from ${low} to ${high}.`;
    stashHandoff({ userMessage: `Explain my ${horizonStr}-year projection.`, description, figures, fallback });
    router.push(isDesktop ? "/" : "/chat");
  }

  // ── Chart data (display-currency numbers) ─────────────────────────────────
  const now = new Date();
  const horizonDate = new Date(now.getTime());
  horizonDate.setFullYear(horizonDate.getFullYear() + horizonYears);
  const histPoints = history.map((h) => ({ t: Date.parse(h.date), v: toDisplayNum(h.total_value) }));
  const today = traj ? { t: now.getTime(), v: toDisplayNum(traj.startUsd) } : null;

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ ...eyebrow, marginTop: 14, marginBottom: 12 }}>Forward estimate</div>

      {/* Horizon + contribution controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {HORIZONS.map((h) => (
            <button
              key={h}
              onClick={() => setHorizonYears(h)}
              style={{
                padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500,
                background: horizonYears === h ? "var(--surface-elev)" : "transparent",
                color: horizonYears === h ? "var(--text)" : "var(--text-dim)",
              }}
            >
              {h}y
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: "auto" }}>
          <input
            value={contribAmount}
            onChange={(e) => setContribAmount(e.target.value)}
            placeholder={`Contribution (${displayCurrency})`}
            inputMode="numeric"
            disabled={contribFreq === "none"}
            style={{ ...textInput, width: 150, opacity: contribFreq === "none" ? 0.5 : 1 }}
          />
          <select value={contribFreq} onChange={(e) => setContribFreq(e.target.value as ContribFreq)} style={{ ...textInput, width: 110 }}>
            <option value="none">No contribution</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
      </div>

      {/* Cone chart */}
      <ProjectionChart
        history={histPoints}
        today={today}
        horizon={today ? { t: horizonDate.getTime(), low: toDisplayNum(traj!.trajectory.low), mid: toDisplayNum(traj!.trajectory.mid), high: toDisplayNum(traj!.trajectory.high) } : null}
        horizonYear={horizonDate.getFullYear()}
        symbol={sym}
      />

      {/* Endpoint readout */}
      {traj && (
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 12 }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 4 }}>In {horizonYears} years (mid)</div>
            <div className="font-serif" style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--hero)", lineHeight: 1 }}>
              {m(traj.trajectory.mid)}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 13, color: "var(--text-dim)" }}>
            <div>low {m(traj.trajectory.low)}</div>
            <div>high {m(traj.trajectory.high)}</div>
          </div>
        </div>
      )}

      {/* Assumptions */}
      {traj && (
        <div style={{ marginTop: 18, padding: "12px 14px", background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12 }}>
          <div style={{ ...eyebrow, marginBottom: 8 }}>Assumptions</div>
          {traj.assumptions.map((a, i) => (
            <div key={i} style={{ fontSize: 12.5, color: "var(--text-dim)", lineHeight: 1.5, marginBottom: 3 }}>{a}</div>
          ))}
          <div className="font-serif" style={{ fontStyle: "italic", fontSize: 13, color: "var(--text-faint)", marginTop: 8 }}>
            Estimate, not advice.
          </div>
        </div>
      )}

      {traj && (
        <button onClick={discuss} style={{ marginTop: 14, padding: "8px 0", background: "transparent", color: "var(--accent-text)", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", letterSpacing: "0.01em" }}>
          Discuss with assistant →
        </button>
      )}

      {/* Solve-for */}
      <div style={{ marginTop: 18, padding: "14px", background: "var(--surface)", border: "0.5px solid var(--border)", borderRadius: 12 }}>
        <div style={{ ...eyebrow, marginBottom: 10 }}>Solve for a target</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <input
            value={targetInput}
            onChange={(e) => setTargetInput(e.target.value)}
            placeholder={`Target (${displayCurrency})`}
            inputMode="numeric"
            style={{ ...textInput, flex: 1, minWidth: 140 }}
          />
          <input
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            placeholder="Year"
            inputMode="numeric"
            maxLength={4}
            style={{ ...textInput, width: 90 }}
          />
          <select value={solveFreq} onChange={(e) => setSolveFreq(e.target.value as "monthly" | "yearly")} style={{ ...textInput, width: 110 }}>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        {prefilled && <div style={{ fontSize: 11.5, color: "var(--text-faint)", marginBottom: 8 }}>Prefilled from your goal.</div>}
        {solve && targetInput.trim() && /^\d{4}$/.test(yearInput.trim()) ? (
          <div style={{ fontSize: 14, color: "var(--text)" }}>
            Required contribution:{" "}
            <span className="font-serif" style={{ fontWeight: 600, color: "var(--hero)" }}>
              {m(solve.solve.amountPerPeriod)}
            </span>{" "}
            <span style={{ color: "var(--text-dim)" }}>{solve.solve.frequency === "annual" ? "per year" : "per month"}</span>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: "var(--text-faint)" }}>Enter a target and year to see the required contribution.</div>
        )}
      </div>
    </div>
  );
}

// ── Sibling chart: matches NetWorthChart's language, adds a forward cone ───────
// Historical net worth as a solid line; past "today" a shaded low–high band with
// a dashed mid line, so the projection reads as estimate, not fact.
function ProjectionChart({
  history,
  today,
  horizon,
  horizonYear,
  symbol,
}: {
  history: Array<{ t: number; v: number }>;
  today: { t: number; v: number } | null;
  horizon: { t: number; low: number; mid: number; high: number } | null;
  horizonYear: number;
  symbol: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw && cw > 0) setW(Math.floor(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const H = 170;
  const PAD_TOP = 8;
  const PAD_RIGHT = 10;
  const PAD_BOTTOM = 18;
  const drawW = Math.max(10, w - PAD_RIGHT);
  const drawH = H - PAD_TOP - PAD_BOTTOM;

  if (!today || !horizon) {
    return <div style={{ height: H }} />;
  }

  const minT = history.length ? Math.min(history[0].t, today.t) : today.t;
  const maxT = horizon.t;
  const xOf = (t: number) => (maxT === minT ? 0 : ((t - minT) / (maxT - minT)) * drawW);

  const yMaxRaw = Math.max(today.v, horizon.high, ...history.map((h) => h.v), 1);
  const yMax = niceCeil(yMaxRaw * 1.08) || 1;
  const yOf = (v: number) => PAD_TOP + drawH - (v / yMax) * drawH;

  const histPts = [...history.filter((h) => h.t <= today.t), today];
  const histPath = histPts.length >= 2 ? "M " + histPts.map((p) => `${xOf(p.t).toFixed(1)} ${yOf(p.v).toFixed(1)}`).join(" L ") : "";

  const xT = xOf(today.t);
  const yT = yOf(today.v);
  const xH = xOf(horizon.t);
  const band = `M ${xT.toFixed(1)} ${yT.toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.high).toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.low).toFixed(1)} Z`;
  const midPath = `M ${xT.toFixed(1)} ${yT.toFixed(1)} L ${xH.toFixed(1)} ${yOf(horizon.mid).toFixed(1)}`;

  const compact = (n: number) => {
    const a = Math.abs(n);
    if (a >= 1_000_000) return `${symbol}${(a / 1_000_000).toFixed(1)}M`;
    if (a >= 1_000) return `${symbol}${Math.round(a / 1_000)}K`;
    return `${symbol}${Math.round(a)}`;
  };
  const yLabels = [0, yMax / 2, yMax];

  return (
    <div style={{ display: "flex", alignItems: "stretch", height: H }}>
      <div ref={ref} style={{ flex: 1, position: "relative" }}>
        <svg viewBox={`0 0 ${w} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
          {/* forward band (low–high) */}
          <path d={band} fill="var(--accent)" fillOpacity={0.12} />
          {/* today divider */}
          <line x1={xT} y1={PAD_TOP} x2={xT} y2={PAD_TOP + drawH} stroke="var(--border-strong)" strokeWidth={1} strokeDasharray="3 3" opacity={0.7} />
          {/* history (solid) */}
          {histPath && <path d={histPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
          {/* mid projection (dashed) */}
          <path d={midPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
          {/* endpoint dot */}
          <circle cx={xH} cy={yOf(horizon.mid)} r={3} fill="var(--accent)" />
        </svg>

        {/* x labels (HTML overlay so fonts aren't stretched by preserveAspectRatio) */}
        <span style={{ position: "absolute", bottom: 0, left: `${(xT / Math.max(w, 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 10, color: "var(--text-faint)" }}>today</span>
        <span style={{ position: "absolute", bottom: 0, right: 0, fontSize: 10, color: "var(--text-faint)" }}>{horizonYear}</span>
      </div>

      {/* Y-axis labels */}
      <div style={{ width: 44, position: "relative" }}>
        {yLabels.map((v) => (
          <div
            key={v}
            style={{
              position: "absolute",
              top: `${(1 - v / yMax) * 100}%`,
              right: 0,
              transform: "translateY(-50%)",
              fontSize: 11,
              color: "var(--text-faint)",
              lineHeight: 1,
              pointerEvents: "none",
            }}
          >
            {compact(v)}
          </div>
        ))}
      </div>
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
