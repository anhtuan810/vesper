// Determinism tests for the snapshot date lattice (pure, no I/O).
// Run:  npx tsx scripts/verify-snapshot-dates.ts
//
// Guards the sawtooth bug: the OLD lattice anchored its weekly grid at
// `today − 30` and stepped back 7 days, so the targeted dates SHIFTED every
// day. Combined with upsert-skip, each run inserted fresh-vintage rows between
// a previous run's, producing alternating present/absent totals. The fix makes
// the weekly (Mondays) and monthly (1sts) tiers CALENDAR-anchored, so every run
// targets the same historical dates and the upsert keeps them all current.

import { targetSnapshotDates } from "../src/lib/snapshot";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const dow = (iso: string) => new Date(iso + "T12:00:00Z").getUTCDay(); // 0=Sun,1=Mon
const isMonday = (iso: string) => dow(iso) === 1;
const isFirstOfMonth = (iso: string) => iso.slice(8, 10) === "01";
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

const EARLIEST = "2022-01-10";

console.log("Calendar-anchoring (the fix): every non-daily date is a Monday or a 1st");
{
  // A Wednesday run.
  const dates = targetSnapshotDates(EARLIEST, "2026-06-10", true);
  const offGrid = dates.filter((d) => {
    const age = daysBetween(d, "2026-06-10");
    if (age <= 30) return false; // daily tier — any weekday allowed
    return !isMonday(d) && !isFirstOfMonth(d);
  });
  check("no off-grid dates older than 30d", offGrid.length === 0, offGrid.slice(0, 5).join(", "));
  check("dates are sorted ascending", dates.every((d, i) => i === 0 || d > dates[i - 1]));
  check("dates are unique", new Set(dates).size === dates.length);
  check("all within [earliest, today)", dates.every((d) => d >= EARLIEST && d < "2026-06-10"));
}

console.log("\nCross-run stability: historical dates do NOT move day-to-day");
{
  // Five consecutive run-days spanning a week boundary (Mon 8th … Fri 12th).
  const runDays = ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11", "2026-06-12"];
  const sets = runDays.map((t) => targetSnapshotDates(EARLIEST, t, true));

  // Compare the RAW date sets between consecutive run-days (not age-filtered —
  // a fixed calendar Monday/1st has a different AGE each day, so age-windowing
  // would spuriously flag a date that is in fact present in both runs). Every
  // differing date must be explainable as either daily-tier churn (recent) or
  // the single Monday at the ~1-year weekly cutoff. Anything else means a
  // historical date moved day-to-day — the old sawtooth bug.
  let onlyExpectedDrift = true;
  const offenders: string[] = [];
  for (let i = 1; i < runDays.length; i++) {
    const a = new Set(sets[i - 1]);
    const b = new Set(sets[i]);
    const diff = [...new Set([...a, ...b])].filter((d) => a.has(d) !== b.has(d));
    for (const d of diff) {
      const ageNow = daysBetween(d, runDays[i]);
      const recentChurn = ageNow <= 35;             // daily tier + current partial week
      const yearBoundary = Math.abs(ageNow - 365) <= 14;
      if (!recentChurn && !yearBoundary) { onlyExpectedDrift = false; offenders.push(d); }
    }
  }
  check("no historical date moves day-to-day (dense zone stable)", onlyExpectedDrift, offenders.slice(0, 5).join(", "));

  // Direct proof the dense interior is calendar-stable: the set of Mondays AND
  // 1sts that are 36..350 days old on a Wednesday run equals the same on the
  // Thursday run (intersection of the two age windows, computed per run-day).
  const interiorGrid = (dates: string[], today: string) =>
    new Set(dates.filter((d) => {
      const a = daysBetween(d, today);
      return a >= 36 && a <= 349 && (isMonday(d) || isFirstOfMonth(d));
    }));
  // A date in either run's interior window must appear in BOTH full sets.
  const wed = sets[2], thu = sets[3];
  const wedInterior = interiorGrid(wed, runDays[2]);
  const thuFull = new Set(thu);
  const wedFull = new Set(wed);
  const interiorShared =
    [...wedInterior].every((d) => thuFull.has(d)) &&
    [...interiorGrid(thu, runDays[3])].every((d) => wedFull.has(d));
  check("every dense-interior date is present in the adjacent run", interiorShared);

  // The classic symptom would be near-half-week spacing in the weekly zone.
  // Assert weekly spacing is exactly 7 days between consecutive Mondays.
  const weekly = sets[2]
    .filter((d) => { const a = daysBetween(d, runDays[2]); return a > 30 && a <= 365 && isMonday(d); });
  const gaps = weekly.slice(1).map((d, i) => daysBetween(weekly[i], d));
  check("weekly gaps are all exactly 7 days", gaps.every((g) => g === 7), `gaps=${[...new Set(gaps)].join(",")}`);
}

console.log("\nNon-tradeable portfolio: monthly cadence only (1st of month)");
{
  const dates = targetSnapshotDates(EARLIEST, "2026-06-10", false);
  check("every date is a 1st of month", dates.every(isFirstOfMonth));
  check("spans back to earliest month", dates[0] <= "2022-02-01", dates[0]);
  check("stops before today", dates.every((d) => d < "2026-06-10"));
}

console.log("\nRecent coverage: daily tier present for a tradeable portfolio");
{
  const dates = targetSnapshotDates(EARLIEST, "2026-06-10", true);
  const recent = dates.filter((d) => daysBetween(d, "2026-06-10") <= 7);
  check("at least 6 of the last 7 days are covered", recent.length >= 6, `covered=${recent.length}`);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
