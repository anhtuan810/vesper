import type { Asset } from '@/lib/supabase';
import type { Band, Snapshot, VitalUser } from './types';

export interface ConcentrationValue {
  topPositionPct: number;
  topPositionName: string;
  top3Pct: number;
  weeksAboveThreshold: number;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return assets.length >= 2;
}

export function compute(
  _user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): ConcentrationValue {
  const gross = assets.reduce((s, a) => s + a.value, 0);
  if (gross <= 0) {
    return { topPositionPct: 0, topPositionName: '', top3Pct: 0, weeksAboveThreshold: 0 };
  }

  const sorted = [...assets].sort((a, b) => b.value - a.value);
  const topPositionPct = (sorted[0].value / gross) * 100;
  const topPositionName = sorted[0].name;
  const top3Pct = sorted.slice(0, 3).reduce((s, a) => s + (a.value / gross) * 100, 0);
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

  return { topPositionPct, topPositionName, top3Pct, weeksAboveThreshold };
}

export function band(value: ConcentrationValue): Band {
  if (value.topPositionPct > 50) return 'red';
  if (value.topPositionPct > 35) return 'amber';
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
