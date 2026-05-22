import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { EU_HOMEOWNER_RE_WEIGHT_PCT } from '@/lib/vitals/benchmarks';
import type { Band, Snapshot, VitalUser } from './types';

export interface RealAssetWeightValue {
  propertyEquityPct: number;
  percentileEU: number;
  trend12moPts: number;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return assets.some(a => a.type === 'real_estate');
}

export function compute(
  _user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): RealAssetWeightValue {
  const netWorth = computeNetWorth(assets);
  if (netWorth <= 0) {
    return { propertyEquityPct: 0, percentileEU: 0, trend12moPts: 0 };
  }

  const propertyEquity = assets
    .filter(a => a.type === 'real_estate')
    .reduce((s, a) => s + Math.max(0, a.value - computeCurrentBalance(a)), 0);

  const propertyEquityPct = (propertyEquity / netWorth) * 100;
  const percentileEU = lerpPercentile(propertyEquityPct);

  let trend12moPts = 0;
  if (snapshots && snapshots.length > 0) {
    const snap365 = findClosestToTarget(snapshots, daysAgoStr(365));
    if (snap365 && snap365.total_value > 0) {
      const oldRePct = ((snap365.breakdown?.['real_estate'] ?? 0) / snap365.total_value) * 100;
      trend12moPts = propertyEquityPct - oldRePct;
    }
  }

  return { propertyEquityPct, percentileEU, trend12moPts };
}

export function band(value: RealAssetWeightValue): Band {
  if (value.propertyEquityPct > 75 || value.propertyEquityPct < 10) return 'amber';
  return 'green';
}

// Linear interpolation anchored at EU_HOMEOWNER_RE_WEIGHT_PCT → 50th percentile
function lerpPercentile(pct: number): number {
  const median = EU_HOMEOWNER_RE_WEIGHT_PCT;
  if (pct <= median) {
    return Math.round(Math.max(0, (pct / median) * 50));
  }
  return Math.round(Math.min(99, 50 + ((pct - median) / (100 - median)) * 49));
}

function computeNetWorth(assets: Asset[]): number {
  return assets.reduce((s, a) => {
    if (a.type === 'real_estate') return s + Math.max(0, a.value - computeCurrentBalance(a));
    return s + a.value;
  }, 0);
}

function daysAgoStr(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function findClosestToTarget(snapshots: Snapshot[], targetDate: string): Snapshot | null {
  let best: Snapshot | null = null;
  let bestDiff = Infinity;
  for (const snap of snapshots) {
    const diff = Math.abs(Date.parse(snap.date) - Date.parse(targetDate));
    if (diff < bestDiff) {
      bestDiff = diff;
      best = snap;
    }
  }
  return best;
}
