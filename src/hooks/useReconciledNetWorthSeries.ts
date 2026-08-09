"use client";

// Shared "building" reconciliation for the net-worth chart — extracted from
// PortfolioTab (mobile Overview) so the desktop Overview (OverviewContent) gets
// the identical fix instead of drifting into its own copy.
//
// ANY holdings change (add, remove, mistake-delete, quantity edit) leaves the
// stored snapshots describing the OLD book while today's live tip describes the
// NEW one — so the raw line spikes (on add) or drops off a cliff (on remove) at
// today, until the background reconstruction (backfillSnapshots) rewrites the
// history. Rather than patch each direction, this reconciles the displayed line
// to what the user holds NOW — exactly what the rebuild will produce, so the
// later swap is seamless: compare each asset type's live equity to what the
// latest snapshot carries, RAMP UP a just-added back-dated asset, and SUBTRACT a
// removed one's stored trajectory. Self-clears the instant the rebuild lands
// (every delta collapses to ~0, so this returns { series: null }). See
// reconcileHistoryToHoldings in src/lib/networth-estimate.ts for the pure math.
//
// Lens-agnostic by design: callers pass whatever base history / breakdown /
// total / asset list they're ALREADY showing under their own lens (mobile's
// Liquid toggle, desktop's include/exclude-property toggle) — this hook never
// needs to know a lens exists. A type absent from both the live breakdown and
// the latest snapshot (e.g. property under desktop's "exclude property" lens)
// simply never enters the per-type delta scan, so it's naturally excluded.

import { useMemo } from "react";
import type { SnapshotPoint, Range } from "@/components/NetWorthChart";
import { convertPointToDisplay, buildLiveRates } from "@/components/NetWorthChart";
import { clipToRange } from "@/lib/networth-history";
import type { LiveAsset } from "@/lib/supabase";
import { toDisplay, type DisplayCurrency } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { usePortfolioBuilding } from "@/lib/portfolio-build";
import { reconcileHistoryToHoldings, type PendingRamp, type Removal, type ReconcilePoint } from "@/lib/networth-estimate";

export interface ReconciledNetWorthSeries {
  // The reconciled, chart-ready series (today's live tip already appended), or
  // null when there's nothing to reconcile — the caller should fall back to its
  // normal (buildSeries-based) series in that case.
  series: SnapshotPoint[] | null;
  // True exactly when `series` is non-null — a convenience so callers don't
  // repeat the `!= null` check when gating the chart's `estimated` prop and
  // marker visibility (the reconciled points aren't real snapshots and can't be
  // rewound into).
  estimated: boolean;
}

export interface UseReconciledNetWorthSeriesOptions {
  // Skip reconciliation entirely — e.g. mobile's Liquid lens, which is a wholly
  // different valuation (no property, no per-type breakdown) rather than a
  // filtered view of the same net-worth total.
  disabled?: boolean;
  // ALREADY lens-filtered full snapshot history (ascending, no live tip).
  fullSnapshots: SnapshotPoint[];
  range: Range;
  // ALREADY lens-filtered current holdings (e.g. desktop excludes real_estate
  // assets here too when its property lens is off — see the module doc: not
  // strictly required for correctness, since an absent type never enters the
  // delta scan, but keeps the candidate-grouping loop from doing dead work).
  netWorthAssets: LiveAsset[];
  // ALREADY lens-filtered live per-asset-type equity, display currency.
  todayBreakdown: Record<string, number>;
  // The live total under the CURRENT lens, display currency — used both as the
  // materiality threshold basis and as the appended live tip's value.
  liveTotal: number;
  displayCurrency: DisplayCurrency;
}

export function useReconciledNetWorthSeries(opts: UseReconciledNetWorthSeriesOptions): ReconciledNetWorthSeries {
  const { disabled, fullSnapshots, range, netWorthAssets, todayBreakdown, liveTotal, displayCurrency } = opts;
  // True while a back-dated add's history reconstruction is in flight (set by
  // the chat/add flow via watchPortfolioBuild) — the precise window to reconcile
  // in regardless of mismatch size.
  const building = usePortfolioBuilding();

  const series = useMemo<SnapshotPoint[] | null>(() => {
    if (disabled) return null;
    const today = new Date().toISOString().slice(0, 10);
    const realClipped = clipToRange(fullSnapshots, range).filter((p) => p.date !== today);
    // A cold start (no history to reconcile against) stays with the existing
    // "Building your history…" card rather than a fabricated line.
    if (realClipped.length === 0) return null;
    const latest = realClipped[realClipped.length - 1];
    const toDisp = (usd: number) => toDisplay(usd, "USD", displayCurrency) ?? 0;
    const equityDisplay = (a: LiveAsset): number => {
      const eq = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
      return toDisplay(eq, a.currency || "USD", displayCurrency) ?? 0;
    };

    // Current back-dated holdings by type — the shape source for add-ramps.
    const backDatedByType = new Map<string, LiveAsset[]>();
    for (const a of netWorthAssets) {
      if (!a.buy_date || a.buy_date >= today) continue;
      const group = backDatedByType.get(a.type);
      if (group) group.push(a);
      else backDatedByType.set(a.type, [a]);
    }

    // Per-type disagreement between the current book and the latest snapshot.
    const ADD_FLOOR = Math.max(1000, liveTotal * 0.02);
    const types = new Set<string>([...Object.keys(todayBreakdown), ...Object.keys(latest.breakdown ?? {})]);
    const additions: PendingRamp[] = [];
    const removals: Removal[] = [];
    let maxAbsDelta = 0;
    for (const type of types) {
      const live = todayBreakdown[type] ?? 0;
      const hist = toDisp(latest.breakdown?.[type] ?? 0);
      const delta = live - hist;
      if (Math.abs(delta) > maxAbsDelta) maxAbsDelta = Math.abs(delta);
      if (delta > ADD_FLOOR) {
        // Under-represented: a just-added back-dated holding not yet in history.
        const group = backDatedByType.get(type) ?? [];
        const groupCur = group.reduce((s, a) => s + equityDisplay(a), 0);
        if (groupCur <= 0) continue;
        for (const a of group) {
          const buyDate = a.buy_date!.length === 7 ? `${a.buy_date}-01` : a.buy_date!;
          additions.push({
            excess: delta * (equityDisplay(a) / groupCur),
            asset: {
              buyDate,
              buyPrice: toDisplay(a.buy_price ?? a.value, a.currency || "USD", displayCurrency) ?? 0,
              currentValue: toDisplay(a.value, a.currency || "USD", displayCurrency) ?? 0,
              mortgage: a.type === "real_estate" && a.mortgage_balance
                ? {
                    balance: toDisplay(a.mortgage_balance, a.currency || "USD", displayCurrency) ?? 0,
                    recordedAt: a.mortgage_balance_recorded_at ?? null,
                    rate: a.mortgage_rate ?? null,
                    monthlyPayment: toDisplay(a.monthly_payment ?? 0, a.currency || "USD", displayCurrency) ?? 0,
                    type: a.mortgage_type ?? null,
                  }
                : null,
            },
          });
        }
      } else if (-delta > ADD_FLOOR && hist > 0) {
        // Over-represented: a removed/reduced holding still baked into history.
        removals.push({ type, fraction: Math.min(1, -delta / hist) });
      }
    }
    if (additions.length === 0 && removals.length === 0) return null;

    // Only reconcile during a genuine rebuild window (`building`, set by the
    // chat/add flow) OR when the mismatch is far larger than any market move
    // could explain (covers a manual add/remove that raises no build flag). A
    // normal up/down day never qualifies, so it can never draw a dashed line.
    if (!building && maxAbsDelta <= liveTotal * 0.10) return null;

    const liveRates = buildLiveRates();
    const points: ReconcilePoint[] = realClipped.map((p) => {
      const byType: Record<string, number> = {};
      for (const [t, usd] of Object.entries(p.breakdown ?? {})) byType[t] = toDisp(usd);
      return { date: p.date, total: convertPointToDisplay(p, displayCurrency, liveRates), byType };
    });
    const reconciled = reconcileHistoryToHoldings(points, additions, removals, today);
    // Wrap for the chart: a display-tagged native_breakdown makes the chart's
    // per-point conversion an identity (same trick as the Liquid series). Then
    // append today's live tip so the line lands exactly on the current value.
    const out: SnapshotPoint[] = reconciled.map((pt) => ({
      date: pt.date,
      total_value: pt.total,
      native_breakdown: { [displayCurrency]: pt.total },
    }));
    out.push({ date: today, total_value: liveTotal, native_breakdown: { [displayCurrency]: liveTotal } });
    return out;
  }, [disabled, fullSnapshots, range, netWorthAssets, todayBreakdown, liveTotal, displayCurrency, building]);

  return { series, estimated: series != null };
}
