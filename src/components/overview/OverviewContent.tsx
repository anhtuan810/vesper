"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  NetWorthChart,
  buildSeries,
  rangeStartDate,
  convertPointToDisplay,
  buildLiveRates,
  type SnapshotPoint,
  type Range,
} from "@/components/NetWorthChart";
import { AssetLogo } from "@/components/AssetLogo";
import { MiniSparkline } from "@/components/MiniSparkline";
import { useDisplayCurrency, useSparklines, useVitals, useUser } from "@/lib/hooks";
import { toDisplay, formatMoney } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { isIncomePension } from "@/lib/pension";
import { displayName, STARTING_POSITION_CTX, unitNoun } from "@/lib/diary-utils";
import { pctChange, displayTicker } from "@/lib/utils";
import { firstSnapshotDate } from "@/lib/networth-history";
import { apiFetch } from "@/lib/api";
import {
  CATEGORY_MAP, CATEGORY_LABEL, CATEGORY_ORDER,
} from "@/lib/categories";
import type { LiveAsset, Mutation } from "@/lib/supabase";
import type {
  ConcentrationValue, LiquidityPostureValue, LeverageValue,
  DrawdownValue, CashRealYieldValue, RealGrowthValue, VitalKey,
} from "@/lib/vitals";

// Same range-clipping the desktop dashboard uses (see PortfolioTab): keep every
// row in the window plus the latest row before it as a left anchor.
function clipToRange(full: SnapshotPoint[], range: Range): SnapshotPoint[] {
  const windowStart = rangeStartDate(range);
  if (windowStart == null) return full;
  let anchor: SnapshotPoint | null = null;
  const within: SnapshotPoint[] = [];
  for (const p of full) {
    if (p.date < windowStart) anchor = p;
    else within.push(p);
  }
  return anchor ? [anchor, ...within] : within;
}

// Category accent (matches the chart bands + the mockup's class colours).
const CAT_DOT: Record<string, string> = {
  property: "var(--prop)", markets: "var(--eq)", crypto: "var(--cry)", reserves: "var(--res)",
};

const fmtPct = (n: number, decimals = 0) =>
  new Intl.NumberFormat("nl-NL", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);

function mDate(m: Mutation): string {
  return (m.occurred_at || m.recorded_at);
}
function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

// Title for a logged decision, built from the mutation (no invented copy).
function decisionTitle(m: Mutation): string {
  const name = displayName(m);
  if (!name) {
    return m.action === "add" ? "Added a holding" : m.action === "remove" ? "Removed a holding" : "Adjusted the portfolio";
  }
  if (m.action === "add") return `Added ${name}`;
  if (m.action === "remove") return `Removed ${name}`;
  return `Adjusted ${name}`;
}
function hasOwnNote(m: Mutation): boolean {
  return !!m.personal_context && m.personal_context !== STARTING_POSITION_CTX;
}
// Value impact of a change → "▲ €34.000" / "▼ €33.000" (or null when flat).
function impact(m: Mutation, displayCurrency: ReturnType<typeof useDisplayCurrency>): { text: string; dn: boolean } | null {
  const cur = m.currency || "USD";
  let amt: number;
  if (m.action === "add") amt = m.after_value ?? 0;
  else if (m.action === "remove") amt = -(m.before_value ?? 0);
  else amt = (m.after_value ?? 0) - (m.before_value ?? 0);
  if (!amt) return null;
  const dn = amt < 0;
  return { text: `${dn ? "▼" : "▲"} ${formatMoney(Math.abs(amt), cur, displayCurrency)}`, dn };
}

function firstName(user: { user_metadata?: Record<string, unknown>; email?: string } | null | undefined): string {
  const meta = user?.user_metadata ?? {};
  const full = (meta.full_name || meta.name) as string | undefined;
  if (full) return full.trim().split(/\s+/)[0];
  if (user?.email) return user.email.split("@")[0];
  return "there";
}
function greeting(d: Date): string {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
// Manual, locale-independent date so server and client render identically (the
// component is SSR-safe even though it normally only mounts client-side).
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function headDate(d: Date): string {
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Props {
  assets: LiveAsset[];
  netTotal: number;
  initialSnapshots?: SnapshotPoint[];
  valuesSettled: boolean;
  mutations: Mutation[];
}

export function OverviewContent({ assets, netTotal, initialSnapshots, valuesSettled, mutations }: Props) {
  const displayCurrency = useDisplayCurrency();
  const { user } = useUser();
  const { data: vitalsData } = useVitals();
  // Clock-dependent header is computed after mount to stay hydration-safe.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  const netWorthAssets = useMemo(() => assets.filter((a) => !isIncomePension(a)), [assets]);

  // ── Net-worth chart series (mirrors PortfolioTab's data flow) ──────────────
  const [range, setRange] = useState<Range>("1M");
  const [fullSnapshots, setFullSnapshots] = useState<SnapshotPoint[]>(initialSnapshots ?? []);
  const [loading, setLoading] = useState(!initialSnapshots);
  const [selectedPoint, setSelectedPoint] = useState<SnapshotPoint | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/api/snapshots?range=All`, { signal: controller.signal })
      .then((r) => r.json())
      .then((body) => { setFullSnapshots(body.data ?? []); setLoading(false); })
      .catch((err) => { if (err.name !== "AbortError") setLoading(false); });
    return () => controller.abort();
  }, []);

  const todayBreakdown = useMemo(() => {
    const result: Record<string, number> = {};
    for (const a of netWorthAssets) {
      const equity = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
      const inDisplay = toDisplay(equity, a.currency || "USD", displayCurrency);
      if (inDisplay != null) result[a.type] = (result[a.type] ?? 0) + inDisplay;
    }
    return result;
  }, [netWorthAssets, displayCurrency]);

  const series = useMemo(
    () => buildSeries(clipToRange(fullSnapshots, range), netTotal, todayBreakdown),
    [fullSnapshots, range, netTotal, todayBreakdown],
  );
  const trackingSinceDate = firstSnapshotDate(fullSnapshots);

  // "+X% since YYYY" badge from the earliest real snapshot.
  const sinceBadge = useMemo(() => {
    if (fullSnapshots.length < 2) return null;
    const first = fullSnapshots[0];
    const firstVal = convertPointToDisplay(first, displayCurrency, buildLiveRates());
    if (!firstVal || firstVal <= 0) return null;
    const pct = Math.round(((netTotal - firstVal) / firstVal) * 100);
    return `${pct >= 0 ? "▲ +" : "▼ −"}${Math.abs(pct)}% since ${first.date.slice(0, 4)}`;
  }, [fullSnapshots, netTotal, displayCurrency]);

  // ── Decision journal (mutations) ───────────────────────────────────────────
  const sortedMutations = useMemo(
    () => [...mutations].sort((a, b) => (mDate(b)).localeCompare(mDate(a))),
    [mutations],
  );
  // Panel follows the chart selection (nearest decision to the scrubbed date),
  // defaulting to the most recent decision.
  const selectedDecision = useMemo(() => {
    if (sortedMutations.length === 0) return null;
    if (!selectedPoint) return sortedMutations[0];
    const target = selectedPoint.date;
    let best = sortedMutations[0];
    let bestDiff = Infinity;
    for (const m of sortedMutations) {
      const diff = Math.abs(new Date(mDate(m)).getTime() - new Date(target).getTime());
      if (diff < bestDiff) { bestDiff = diff; best = m; }
    }
    return best;
  }, [sortedMutations, selectedPoint]);

  // ── Holdings grouped into the 4 semantic categories ────────────────────────
  const symbols = useMemo(
    () => netWorthAssets.map((a) => a.symbol).filter((s): s is string => !!s),
    [netWorthAssets],
  );
  const sparklines = useSparklines(symbols, "1W");

  const groups = useMemo(() => {
    const byCategory: Record<string, LiveAsset[]> = {};
    for (const a of netWorthAssets) {
      const cat = CATEGORY_MAP[a.type] ?? "reserves";
      (byCategory[cat] ??= []).push(a);
    }
    return Object.entries(byCategory)
      .map(([cat, items]) => ({
        category: cat,
        label: CATEGORY_LABEL[cat] ?? cat,
        items: [...items].sort((a, b) => b.value - a.value),
        total: items.reduce((s, a) => {
          const equity = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
          return s + (toDisplay(equity, a.currency || "USD", displayCurrency) ?? 0);
        }, 0),
      }))
      .sort((a, b) => (CATEGORY_ORDER[a.category] ?? 99) - (CATEGORY_ORDER[b.category] ?? 99));
  }, [netWorthAssets, displayCurrency]);

  // ── Vitals summary + the six cards ─────────────────────────────────────────
  const vitalsByKey = useMemo(() => {
    const map = new Map<VitalKey, { band: string; value: unknown; applies: boolean }>();
    for (const v of vitalsData?.vitals ?? []) map.set(v.key, v);
    return map;
  }, [vitalsData]);

  const vitalSummary = useMemo(() => {
    const active = (vitalsData?.vitals ?? []).filter((v) => v.applies);
    const healthy = active.filter((v) => v.band === "green").length;
    const watch = active.filter((v) => v.band === "amber" || v.band === "red").length;
    return { healthy, watch };
  }, [vitalsData]);

  return (
    <>
      <div className="head">
        <div>
          <span className="eyebrow">Overview</span>
          <div className="hello" suppressHydrationWarning>
            {now ? `${greeting(now)}, ${firstName(user)}.` : `Welcome back, ${firstName(user)}.`}
          </div>
        </div>
        <div className="date" suppressHydrationWarning>{now ? headDate(now) : ""}</div>
      </div>

      {/* ── Dashboard card ── */}
      <section className="dash">
        <div className="dash-h">
          <div>
            <span className="eyebrow">Net worth</span>
            <div className="nwnum">{formatMoney(netTotal, displayCurrency, displayCurrency)}</div>
            <div className="nwbasis">
              Equity basis — property shown net of mortgage.
              {sinceBadge && <span className="badge" style={{ marginLeft: 6 }}>{sinceBadge}</span>}
            </div>
          </div>
        </div>

        <div style={{ margin: "18px 0 4px" }}>
          <NetWorthChart
            range={range}
            onRangeChange={setRange}
            series={series}
            loading={loading}
            onSelectPoint={setSelectedPoint}
            valuesSettled={valuesSettled}
            realPointCount={fullSnapshots.length}
            trackingSinceDate={trackingSinceDate}
          />
        </div>

        {/* selected decision */}
        <div className="ep-inline">
          <div className="ep-cue">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12M6 12l6 6 6-6" /></svg>
            The decision behind the selected point — scrub the line to explore
          </div>
          {selectedDecision ? (() => {
            const m = selectedDecision;
            const own = hasOwnNote(m);
            const imp = impact(m, displayCurrency);
            return (
              <>
                <div className="ep-top">
                  <span className="ep-date">{shortDate(mDate(m))}</span>
                  <span className={`ep-kind${own ? "" : " market"}`}>{own ? "Decision" : m.market_context ? "Market" : "Update"}</span>
                </div>
                <h3 className="ep-title">{decisionTitle(m)}</h3>
                {m.market_context && <p className="ep-ctx">{m.market_context}</p>}
                <p className="ep-why">
                  {own ? m.personal_context
                    : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here."
                    : "Recorded automatically — no note attached."}
                </p>
                {imp && <div className="ep-foot"><span className={`ep-imp${imp.dn ? " dn" : ""}`}>{imp.text}</span></div>}
              </>
            );
          })() : (
            <p className="ep-empty">No decisions logged yet. Tell Volnar what changed and it records the reason here.</p>
          )}
        </div>

        {/* expandable holdings */}
        <div className="holds" id="holdings">
          {groups.map((g) => (
            <HoldingGroup
              key={g.category}
              category={g.category}
              label={g.label}
              total={g.total}
              pct={netTotal > 0 ? Math.round((g.total / netTotal) * 100) : 0}
              items={g.items}
              displayCurrency={displayCurrency}
              sparklines={sparklines}
            />
          ))}
        </div>

        {/* vitals footer */}
        <div className="dash-foot">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: vitalSummary.healthy }).map((_, i) => <i key={`h${i}`} />)}
            {Array.from({ length: vitalSummary.watch }).map((_, i) => <i key={`w${i}`} className="w" />)}
          </span>
          {vitalsData
            ? `Vitals · ${vitalSummary.healthy} healthy · ${vitalSummary.watch} to watch · every change is journalled`
            : "Vitals loading · every change is journalled"}
        </div>
      </section>

      {/* ── Vitals ── */}
      <section className="sec">
        <div className="sec-top">
          <div>
            <span className="eyebrow">Vitals</span>
            <h2>Not just what you own — <span className="g">how well it&apos;s built.</span></h2>
          </div>
          <Link className="lk" href="/vitals">See all Vitals →</Link>
        </div>
        <div className="vrow">
          <VitalCard name="Concentration" v={vitalsByKey.get("concentration")} render={(val: ConcentrationValue, b) => ({
            value: `${fmtPct(val.topPositionPct)}%`, unit: val.topPositionName ? ` · ${val.topPositionName}` : "",
            read: "Largest single position as a share of the book.", bar: clamp(val.topPositionPct), thr: 35, band: b,
          })} />
          <VitalCard name="Liquidity" v={vitalsByKey.get("liquidityPosture")} render={(val: LiquidityPostureValue, b) => ({
            value: `${fmtPct(val.deployable1wPct)}%`, unit: " in a week",
            read: "Share of wealth reachable within seven days.", bar: clamp(val.deployable1wPct), thr: 15, band: b,
          })} />
          <VitalCard name="Leverage" v={vitalsByKey.get("leverage")} render={(val: LeverageValue, b) => ({
            value: `${fmtPct(val.ltvPct)}%`, unit: " LTV",
            read: "Loan-to-value across your property.", bar: clamp(val.ltvPct), thr: 50, thr2: 75, band: b,
          })} />
          <VitalCard name="Drawdown" v={vitalsByKey.get("drawdown")} render={(val: DrawdownValue, b) => ({
            value: `−${fmtPct(Math.abs(val.shockPctOfNw))}%`, unit: " 2008-style",
            read: "Modelled hit from a simultaneous market crash.", bar: clamp(100 - Math.abs(val.shockPctOfNw)), badTail: clamp(Math.abs(val.shockPctOfNw)), band: b,
          })} />
          <VitalCard name="Cash yield" v={vitalsByKey.get("cashRealYield")} render={(val: CashRealYieldValue, b) => ({
            value: `${val.realYieldPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(val.realYieldPct), 1)}%`, unit: " real",
            read: "Cash yield after inflation and tax.", bar: clamp(((val.realYieldPct + 5) / 10) * 100), band: b,
          })} />
          <VitalCard name="Real growth" v={vitalsByKey.get("realGrowth")} render={(val: RealGrowthValue, b) => ({
            value: `${val.real12moPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(val.real12moPct), 1)}%`, unit: " past year",
            read: "Net-worth growth ahead of inflation.", bar: clamp(((val.real12moPct + 10) / 30) * 100), band: b,
          })} />
        </div>
      </section>

      {/* ── Decision journal ── */}
      <section className="sec">
        <div className="sec-top">
          <div>
            <span className="eyebrow">Decision journal</span>
            <h2>Every change, <span className="g">with the reason.</span></h2>
          </div>
          <Link className="lk" href="/diary">All {sortedMutations.length} entries →</Link>
        </div>
        <div className="ledger">
          {sortedMutations.length === 0 ? (
            <div className="led-empty">Nothing logged yet — your decisions will appear here.</div>
          ) : sortedMutations.slice(0, 6).map((m) => {
            const own = hasOwnNote(m);
            const imp = impact(m, displayCurrency);
            const why = own ? m.personal_context
              : m.market_context ? m.market_context
              : m.personal_context === STARTING_POSITION_CTX ? "Started tracking from here." : "Recorded automatically.";
            return (
              <div className="led" key={m.id}>
                <span className={`led-dot${imp?.dn ? " dn" : ""}`} />
                <span className="led-date">{shortDate(mDate(m))}</span>
                <div>
                  <div className="led-l1">
                    <span className="led-title">{decisionTitle(m)}</span>
                    <span className={`led-tag${own ? "" : " auto"}`}>{own ? "You" : "Auto"}</span>
                  </div>
                  <div className="led-why">{why}</div>
                </div>
                {imp && <span className={`led-imp${imp.dn ? " dn" : ""}`}>{imp.text}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Private by design ── */}
      <section className="sec" style={{ marginBottom: 8 }}>
        <div className="trust">
          <span className="t">Private by design.</span>
          <div className="items">
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>EU-hosted</span>
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2Z" /><path d="M9 9h6" /></svg>Append-only journal</span>
            <span className="it"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M8 12h8" /></svg>No broker sync</span>
          </div>
        </div>
      </section>
    </>
  );
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, n));
}

// ── Vital card ───────────────────────────────────────────────────────────────
type Spec = { value: string; unit: string; read: string; bar: number; thr?: number; thr2?: number; badTail?: number; band: string };
function VitalCard<T>({ name, v, render }: {
  name: string;
  v?: { band: string; value: unknown; applies: boolean };
  render: (value: T, band: string) => Spec;
}) {
  if (!v || !v.applies) {
    return (
      <div className="vital">
        <div className="vt-top"><span className="vt-name">{name}</span><span className="vt-band">—</span></div>
        <div className="vt-val" style={{ color: "var(--muted)" }}>—</div>
        <div className="vt-read">Not enough data yet.</div>
      </div>
    );
  }
  const spec = render(v.value as T, v.band);
  const cls = v.band === "amber" ? "warn" : v.band === "red" ? "bad" : "";
  const bandLabel = v.band === "green" ? "Healthy" : v.band === "red" ? "Alert" : "Watch";
  const fill = cls === "warn" ? "vc-warn" : cls === "bad" ? "vc-bad" : "vc-ok";
  return (
    <div className={`vital ${cls}`}>
      <div className="vt-top">
        <span className="vt-name">{name}</span>
        <span className="vt-band">{bandLabel}</span>
      </div>
      <div className="vt-val">{spec.value}<span>{spec.unit}</span></div>
      <svg className="vc" viewBox="0 0 100 24" aria-hidden="true">
        <rect className="vc-track" x="0" y="9" width="100" height="7" rx="2.5" />
        {spec.badTail != null ? (
          <>
            <rect className="vc-ok" x="0" y="9" width={spec.bar} height="7" rx="2.5" />
            <rect className="vc-bad" x={spec.bar} y="9" width={spec.badTail} height="7" rx="2.5" />
          </>
        ) : (
          <rect className={fill} x="0" y="9" width={spec.bar} height="7" rx="2.5" />
        )}
        {spec.thr != null && <line className="vc-thr" x1={spec.thr} y1="4.5" x2={spec.thr} y2="20.5" />}
        {spec.thr2 != null && <line className="vc-thr" x1={spec.thr2} y1="4.5" x2={spec.thr2} y2="20.5" />}
      </svg>
      <div className="vt-read">{spec.read}</div>
    </div>
  );
}

// ── Expandable holdings group ────────────────────────────────────────────────
function HoldingGroup({ category, label, total, pct, items, displayCurrency, sparklines }: {
  category: string; label: string; total: number; pct: number;
  items: LiveAsset[]; displayCurrency: ReturnType<typeof useDisplayCurrency>;
  sparklines: Record<string, number[]>;
}) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(0);
  const posRef = useRef<HTMLDivElement>(null);
  const accent = CAT_DOT[category] ?? "var(--green)";
  const panelId = `vh-pos-${category}`;

  const toggle = () => {
    const el = posRef.current;
    const next = !open;
    setMaxH(next && el ? el.scrollHeight : 0);
    setOpen(next);
  };

  return (
    <div className={`hg${open ? " open" : ""}`}>
      <button className="hg-h" type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="dr-n"><i style={{ background: accent }} />{label}</span>
        <span className="dr-bar"><span style={{ width: `${Math.max(pct, 2)}%`, background: accent }} /></span>
        <span className="dr-v">{formatMoney(total, displayCurrency, displayCurrency)}<small>{pct}%</small></span>
        <svg className="hg-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <div className="hg-pos" id={panelId} ref={posRef} style={{ maxHeight: maxH }}>
        {items.map((a) => <PositionRow key={a.id} asset={a} displayCurrency={displayCurrency} closes={a.symbol ? sparklines[a.symbol] : undefined} />)}
      </div>
    </div>
  );
}

function PositionRow({ asset, displayCurrency, closes }: {
  asset: LiveAsset; displayCurrency: ReturnType<typeof useDisplayCurrency>; closes?: number[];
}) {
  const isProperty = asset.type === "real_estate";
  const equity = isProperty ? Math.max(0, asset.value - computeCurrentBalance(asset)) : asset.value;
  const value = formatMoney(equity, asset.currency || "USD", displayCurrency);
  const chg = pctChange(asset.livePrice, asset.livePrev);
  const up = chg != null && chg >= 0;
  const hasSpark = !!closes && closes.length >= 2;
  const owned = isProperty && asset.value > 0 ? Math.round((equity / asset.value) * 100) : null;

  const sub = asset.symbol
    ? `${displayTicker(asset.symbol)}${asset.units != null ? ` · ${fmtPct(asset.units, asset.units % 1 === 0 ? 0 : 2)} ${unitNoun(asset.type)}` : ""}`
    : isProperty ? "Property" : CATEGORY_LABEL[CATEGORY_MAP[asset.type] ?? "reserves"];

  return (
    <div className="pos">
      <AssetLogo type={asset.type} symbol={asset.symbol ?? null} name={asset.name} size={42} />
      <div className="pos-m">
        <span className="pos-n">{asset.name}</span>
        <span className="pos-sub">{sub}</span>
      </div>
      {hasSpark
        ? <MiniSparkline prices={closes!} directionUp={chg == null ? undefined : up} width={80} height={28} />
        : <span />}
      <div className="pos-v">
        <span className="pos-val">{value}</span>
        {owned != null
          ? <span className="pos-own">{owned}% owned</span>
          : chg != null && <span className={`pos-chg ${up ? "up" : "dn"}`}>{up ? "+" : "−"}{fmtPct(Math.abs(chg), 1)}%</span>}
      </div>
    </div>
  );
}
