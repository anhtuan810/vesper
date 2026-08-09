// Shared predicate for "is this net-worth history real enough to draw an honest
// conclusion from, or would we just be presenting data entry as performance?"
// Used by the net-worth chart, the period delta, and the long-range projection —
// the same gate, three callers (justifies a shared, tiny module).

import type { SnapshotPoint, Range } from "@/components/NetWorthChart";
import { rangeStartDate } from "@/components/NetWorthChart";

export interface SnapshotLike {
  date: string; // YYYY-MM-DD
  total_value: number;
}

// Earliest snapshot date (ascending-sorted assumption not required — we scan).
// Returns null when there is no real history at all.
export function firstSnapshotDate(snapshots: SnapshotLike[]): string | null {
  if (snapshots.length === 0) return null;
  return snapshots.reduce((min, s) => (s.date < min ? s.date : min), snapshots[0].date);
}

// True when a real snapshot exists at or before `windowStart` (a YYYY-MM-DD
// date string) — i.e. the account was already being tracked at that point, so a
// comparison anchored there reflects market history rather than the moment the
// user started entering their portfolio.
export function hasSufficientHistory(snapshots: SnapshotLike[], windowStart: string): boolean {
  const first = firstSnapshotDate(snapshots);
  return first != null && first <= windowStart;
}

// Clips the FULL snapshot history to a range's display window: every real row
// at or after `windowStart`, plus the single most recent row strictly BEFORE it
// as a left anchor — so the line always starts at the window edge and a bounded
// range never collapses to fewer than 2 points whenever the full history
// actually spans it (sparse monthly-cadence history still draws a continuous
// clipped line). "All" has no window start — pass the full series.
//
// Shared by the mobile Overview (PortfolioTab), the desktop Overview
// (OverviewContent), and useReconciledNetWorthSeries — was duplicated
// byte-for-byte across the first two before being extracted here.
export function clipToRange(full: SnapshotPoint[], range: Range): SnapshotPoint[] {
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
