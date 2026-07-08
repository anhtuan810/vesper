// Unit tests for tradeableUnitsOn — the single source of truth for "how many units
// did the user hold on a past date?" shared by the net-worth rewind (snapshot.ts)
// and the diary market-swing attribution (diary-market-moves.ts). Pure, no I/O.
// Run:  npx tsx scripts/verify-holdings-units.ts
//
// Locks the confirmed regression (the reason NO automatic market entries showed
// for a seeded/imported portfolio): the diary path gated "held on this date?" on
// buy_date/created_at while the net-worth line used the ADD MUTATION's occurred_at.
// When buy_date was NULL and created_at was the recent seed time, every historical
// swing valued the holdings at 0 units and was dropped — yet the chart, using the
// add-mutation date, rewound correctly. tradeableUnitsOn makes both use the same
// precedence, so the two can never disagree again.

import { tradeableUnitsOn, unitsAtDate, type UnitTimelineEntry } from "../src/lib/holdings-units";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// A base input with no timeline; individual tests override what they exercise.
const base = {
  timeline: [] as UnitTimelineEntry[],
  acquisitionDate: null as string | null,
  buyDate: null as string | null,
  createdAt: "2026-07-01",
  removalDate: null as string | null,
  currentUnits: 100,
};

console.log("THE REGRESSION — seeded holding: add mutation in the past, buy_date NULL, created_at recent:");
{
  // The exact shape that broke: the add mutation's occurred_at is 2024-07-01, but
  // the asset row's buy_date is NULL and created_at is the recent import time. The
  // holding carries no unit-bearing timeline (after_units was null → money-only row).
  const seeded = { ...base, acquisitionDate: "2024-07-01", buyDate: null, createdAt: "2026-07-01", currentUnits: 130 };
  check("held on a 2025 swing date (was 0 → swing dropped)", tradeableUnitsOn({ ...seeded, date: "2025-03-15" }) === 130, String(tradeableUnitsOn({ ...seeded, date: "2025-03-15" })));
  check("held the day after acquisition", tradeableUnitsOn({ ...seeded, date: "2024-07-02" }) === 130);
  check("held exactly on the acquisition date", tradeableUnitsOn({ ...seeded, date: "2024-07-01" }) === 130);
  check("NOT held the day before acquisition", tradeableUnitsOn({ ...seeded, date: "2024-06-30" }) === 0);
  check("NOT gated by the recent created_at", tradeableUnitsOn({ ...seeded, date: "2025-01-01" }) === 130);
}

console.log("Acquisition precedence: add-mutation date > buy_date > created_at:");
{
  check("add-mutation date wins over a later buy_date", tradeableUnitsOn({ ...base, date: "2024-08-01", acquisitionDate: "2024-07-01", buyDate: "2025-01-01" }) === 100);
  check("buy_date used when there is no add mutation", tradeableUnitsOn({ ...base, date: "2024-08-01", acquisitionDate: null, buyDate: "2024-07-01", createdAt: "2026-07-01" }) === 100);
  check("…and not held before that buy_date", tradeableUnitsOn({ ...base, date: "2024-06-01", acquisitionDate: null, buyDate: "2024-07-01" }) === 0);
  check("created_at is the last resort", tradeableUnitsOn({ ...base, date: "2026-07-05", acquisitionDate: null, buyDate: null, createdAt: "2026-07-01" }) === 100);
  check("…and gates before created_at when nothing else is known", tradeableUnitsOn({ ...base, date: "2025-01-01", acquisitionDate: null, buyDate: null, createdAt: "2026-07-01" }) === 0);
}

console.log("A unit-bearing timeline is authoritative — acquisition/buy_date inputs are ignored:");
{
  const timeline: UnitTimelineEntry[] = [
    { date: "2024-07-01", units: 50 },
    { date: "2025-02-01", units: 80 },   // topped up
    { date: "2025-09-01", units: 0 },    // sold out
  ];
  const withTl = { ...base, timeline, acquisitionDate: "2020-01-01", buyDate: "2020-01-01", currentUnits: 999 };
  check("before the first entry → 0", tradeableUnitsOn({ ...withTl, date: "2024-06-30" }) === 0);
  check("after the first entry → 50 (not currentUnits 999)", tradeableUnitsOn({ ...withTl, date: "2024-12-31" }) === 50);
  check("after the top-up → 80", tradeableUnitsOn({ ...withTl, date: "2025-03-01" }) === 80);
  check("after the sale → 0", tradeableUnitsOn({ ...withTl, date: "2025-10-01" }) === 0);
  check("on the exact top-up date → 80", tradeableUnitsOn({ ...withTl, date: "2025-02-01" }) === 80);
}

console.log("Sale gate (timeline-less holding): removalDate zeroes units from the sale date on:");
{
  const sold = { ...base, acquisitionDate: "2024-01-01", removalDate: "2025-06-01", currentUnits: 40 };
  check("held before the sale", tradeableUnitsOn({ ...sold, date: "2025-05-31" }) === 40);
  check("not held on the sale date", tradeableUnitsOn({ ...sold, date: "2025-06-01" }) === 0);
  check("not held after the sale", tradeableUnitsOn({ ...sold, date: "2025-07-01" }) === 0);
}

console.log("currentUnits passthrough and zero handling:");
{
  check("a held position with 0 current units contributes 0", tradeableUnitsOn({ ...base, date: "2026-07-05", acquisitionDate: "2024-01-01", currentUnits: 0 }) === 0);
  check("fractional units pass through", tradeableUnitsOn({ ...base, date: "2026-07-05", acquisitionDate: "2024-01-01", currentUnits: 2.5 }) === 2.5);
}

console.log("unitsAtDate primitive:");
{
  const tl: UnitTimelineEntry[] = [{ date: "2024-01-01", units: 10 }, { date: "2024-06-01", units: 25 }];
  check("empty timeline → 0", unitsAtDate([], "2024-03-01") === 0);
  check("walks to the last entry at or before the date", unitsAtDate(tl, "2024-05-31") === 10);
  check("picks up the later entry once reached", unitsAtDate(tl, "2024-06-01") === 25);
}

console.log(failures === 0 ? "\nAll holdings-units checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
