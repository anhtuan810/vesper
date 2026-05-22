import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { getCountryDefaults } from '@/lib/vitals/country-defaults';
import type { Band, Snapshot, VitalUser } from './types';

// Baseline snapshot must be at least this many days old; prevents near-inception noise.
export const MIN_BASELINE_AGE_DAYS = 330;

// Baseline net worth must be at least this fraction of current; smaller means portfolio
// was still being built up and the annualised figure would be misleading.
const BASELINE_FLOOR_RATIO = 0.20;

export interface RealGrowthValue {
  nominal12moPct: number;
  real12moPct: number;
  inflationDragPct: number;
  series: Array<{ date: string; nominal: number; real: number }>;
}

interface BaselineResult {
  snapshot: Snapshot;
  ageDays: number;
}

export function findBaselineSnapshot(snapshots: Snapshot[]): BaselineResult | null {
  const targetMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  let best: Snapshot | null = null;
  let bestDiff = Infinity;
  for (const snap of snapshots) {
    const diff = Math.abs(Date.parse(snap.date) - targetMs);
    if (diff < bestDiff) { bestDiff = diff; best = snap; }
  }
  if (!best) return null;
  const ageDays = Math.round((Date.now() - Date.parse(best.date)) / (24 * 60 * 60 * 1000));
  return { snapshot: best, ageDays };
}

export function applies(
  _user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): boolean {
  if (snapshots == null || snapshots.length < 30) return false;
  const baseline = findBaselineSnapshot(snapshots);
  if (!baseline || baseline.ageDays < MIN_BASELINE_AGE_DAYS) return false;
  const nowNetWorth = computeNetWorth(assets);
  if (nowNetWorth <= 0) return false;
  if (baseline.snapshot.total_value < BASELINE_FLOOR_RATIO * nowNetWorth) return false;
  return true;
}

export function compute(
  user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): RealGrowthValue {
  const { inflationPct } = getCountryDefaults(user.country);
  const snaps = snapshots ?? [];

  const baseline = findBaselineSnapshot(snaps);
  if (!baseline) {
    return { nominal12moPct: 0, real12moPct: 0, inflationDragPct: inflationPct, series: [] };
  }

  const nowNetWorth = computeNetWorth(assets);
  const nominal12moPct = baseline.snapshot.total_value > 0
    ? ((nowNetWorth - baseline.snapshot.total_value) / baseline.snapshot.total_value) * 100
    : 0;

  const real12moPct = nominal12moPct - inflationPct;

  // Series: one data point per calendar month, indexed to first snapshot = 100
  const monthly = dedupeMonthly(snaps);
  const first = monthly[0];
  const series = first && first.total_value > 0
    ? monthly.map(snap => {
        const nominal = (snap.total_value / first.total_value) * 100;
        const elapsedYears =
          (Date.parse(snap.date) - Date.parse(first.date)) / (365.25 * 24 * 60 * 60 * 1000);
        const inflationFactor = Math.pow(1 + inflationPct / 100, elapsedYears);
        return { date: snap.date, nominal, real: nominal / inflationFactor };
      })
    : [];

  return { nominal12moPct, real12moPct, inflationDragPct: inflationPct, series };
}

export function band(value: RealGrowthValue): Band {
  if (value.real12moPct < -2) return 'red';
  if (value.real12moPct < 0) return 'amber';
  return 'green';
}

function computeNetWorth(assets: Asset[]): number {
  return assets.reduce((s, a) => {
    if (a.type === 'real_estate') return s + Math.max(0, a.value - computeCurrentBalance(a));
    return s + a.value;
  }, 0);
}

// Keep the last snapshot in each YYYY-MM window, sorted ascending
function dedupeMonthly(snapshots: Snapshot[]): Snapshot[] {
  const byMonth = new Map<string, Snapshot>();
  for (const snap of snapshots) {
    const key = snap.date.slice(0, 7);
    const existing = byMonth.get(key);
    if (!existing || snap.date > existing.date) byMonth.set(key, snap);
  }
  return [...byMonth.values()].sort((a, b) => a.date.localeCompare(b.date));
}
