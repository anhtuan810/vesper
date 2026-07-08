// The single source of truth for "how many units of a tradeable did the user hold
// on a past date?" — the question the net-worth rewind (snapshot.ts, two sites)
// and the diary market-swing attribution (diary-market-moves.ts) both ask. All
// three used to inline the same formula, and each time one drifted it produced a
// class of bug that is invisible until a specific data shape hits it:
//
//   • A swing valued a holding at 0 units for its whole history → every market
//     swing dropped → the diary showed NO automatic market entries at all.
//   • A rewind valued a holding at 0 → the whole net-worth curve collapsed to
//     zero rows (skip:no-rows-computed) or carved a notch at the affected dates.
//
// Centralising it here (pure, exhaustively unit-tested in verify-holdings-units.ts)
// means the three surfaces agree BY CONSTRUCTION, not by three copies staying in
// sync by hand.

export interface UnitTimelineEntry {
  date: string; // YYYY-MM-DD
  units: number;
}

// Units held as of `date`, walking a sorted-ascending unit timeline (each entry is
// the units held FROM that date until the next). 0 before the first entry. This is
// the authoritative reading whenever a timeline exists — it captures every add /
// edit / sale the user actually recorded.
export function unitsAtDate(timeline: UnitTimelineEntry[], date: string): number {
  let units = 0;
  for (const entry of timeline) {
    if (entry.date > date) break;
    units = entry.units;
  }
  return units;
}

export interface TradeableUnitsInput {
  date: string;              // the historical date being valued (YYYY-MM-DD)
  timeline: UnitTimelineEntry[]; // sorted asc; EMPTY when no mutation carried units
  // Acquisition anchor precedence, matching the net-worth rewind:
  //   1. acquisitionDate — the "add" mutation's occurred_at (the stated buy date).
  //      This is what makes a holding logged today, bought years ago, count back to
  //      its purchase — the field whose omission from the diary path was the bug.
  //   2. buyDate — the asset row's own buy_date, when there is no add mutation.
  //   3. createdAt — the row's insert time, only as a last resort.
  acquisitionDate: string | null;
  buyDate: string | null;
  createdAt: string;         // always present (NOT NULL column)
  removalDate: string | null; // the sale date (remove mutation / removed_at), or null
  currentUnits: number;      // the asset's present units, the timeline-less fallback
}

// Units of a tradeable held on `date`.
//
// When the asset has a unit-bearing timeline, that timeline is authoritative — the
// acquisition/removal/current-units inputs are ignored (the timeline already
// encodes them). Only when the timeline is EMPTY — an add mutation that stored no
// after_units, the shape a seeded/imported holding takes — do we fall back to the
// current units, gated by the acquisition and sale dates so the holding is counted
// exactly across the span it was actually held.
export function tradeableUnitsOn(input: TradeableUnitsInput): number {
  if (input.timeline.length > 0) return unitsAtDate(input.timeline, input.date);
  if (input.removalDate && input.date >= input.removalDate) return 0;
  const inception = input.acquisitionDate ?? input.buyDate ?? input.createdAt;
  if (input.date < inception) return 0;
  return input.currentUnits;
}
