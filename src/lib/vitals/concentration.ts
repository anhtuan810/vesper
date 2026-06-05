import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { isIncomePension } from '@/lib/pension';
import type { Band, Snapshot, VitalScope, VitalUser } from './types';

export const scope: VitalScope = 'both';

export interface ConcentrationValue {
  // Gross fields — all assets
  topPositionPct: number;
  topPositionName: string;
  top3Pct: number;
  weeksAboveThreshold: number;
  topPositionIsRealEstate: boolean;
  // Investable fields — non-real-estate assets only (null when no investable positions)
  investableTopPositionPct: number | null;
  investableTopPositionName: string | null;
  investableTop3Pct: number | null;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return assets.length >= 2;
}

export function compute(
  _user: VitalUser,
  rawAssets: Asset[],
  snapshots?: Snapshot[],
): ConcentrationValue {
  // Income pensions (db/state) are entitlements, not positions — exclude them from
  // every concentration set (gross base, top positions, and investable subset).
  const assets = rawAssets.filter(a => !isIncomePension(a));
  // All-asset base uses EQUITY for real estate (value − current mortgage balance),
  // the identical formula net worth uses in snapshots / liquidity / drawdown, so the
  // concentration denominator equals equity net worth. Non-real-estate assets are
  // unlevered, so their equity equals their value.
  const equityValue = (a: Asset): number =>
    a.type === 'real_estate' ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;

  const base = assets.reduce((s, a) => s + equityValue(a), 0);
  if (base <= 0) {
    return {
      topPositionPct: 0, topPositionName: '', top3Pct: 0, weeksAboveThreshold: 0,
      topPositionIsRealEstate: false,
      investableTopPositionPct: null, investableTopPositionName: null, investableTop3Pct: null,
    };
  }

  const sorted = [...assets].sort((a, b) => equityValue(b) - equityValue(a));
  const topPositionPct = (equityValue(sorted[0]) / base) * 100;
  const topPositionName = sorted[0].name;
  const topPositionIsRealEstate = sorted[0].type === 'real_estate';
  const top3Pct = sorted.slice(0, 3).reduce((s, a) => s + (equityValue(a) / base) * 100, 0);
  const topType = sorted[0].type;

  let weeksAboveThreshold = 0;

  if (snapshots && snapshots.length > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 26 * 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const recent = snapshots.filter(s => s.date >= cutoffStr && s.total_value > 0);

    // Deduplicate to one snapshot per ISO week (take the latest date in each week)
    const byWeek = new Map<string, Snapshot>();
    for (const snap of recent) {
      const key = isoWeekMonday(snap.date);
      const existing = byWeek.get(key);
      if (!existing || snap.date > existing.date) byWeek.set(key, snap);
    }

    for (const snap of byWeek.values()) {
      if (!snap.breakdown) continue;
      const typeValue = snap.breakdown[topType] ?? 0;
      if ((typeValue / snap.total_value) * 100 > 40) weeksAboveThreshold++;
    }
  }

  // Investable fields — non-real-estate positions only
  const investable = sorted.filter(a => a.type !== 'real_estate');
  let investableTopPositionPct: number | null = null;
  let investableTopPositionName: string | null = null;
  let investableTop3Pct: number | null = null;

  if (investable.length > 0) {
    const investableGross = investable.reduce((s, a) => s + a.value, 0) || 1;
    investableTopPositionPct = (investable[0].value / investableGross) * 100;
    investableTopPositionName = investable[0].name;
    investableTop3Pct = investable.slice(0, 3).reduce(
      (s, a) => s + (a.value / investableGross) * 100, 0
    );
  }

  return {
    topPositionPct, topPositionName, top3Pct, weeksAboveThreshold,
    topPositionIsRealEstate,
    investableTopPositionPct, investableTopPositionName, investableTop3Pct,
  };
}

export function band(value: ConcentrationValue): Band {
  const pct = value.investableTopPositionPct ?? value.topPositionPct;
  if (pct > 50) return 'red';
  if (pct > 35) return 'amber';
  return 'green';
}

// Returns the YYYY-MM-DD of the Monday anchoring the ISO week for a date string
function isoWeekMonday(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  const day = d.getUTCDay(); // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() + offset);
  return monday.toISOString().slice(0, 10);
}
