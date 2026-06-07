// Shared predicate for "is this net-worth history real enough to draw an honest
// conclusion from, or would we just be presenting data entry as performance?"
// Used by the net-worth chart, the period delta, and the long-range projection —
// the same gate, three callers (justifies a shared, tiny module).

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
