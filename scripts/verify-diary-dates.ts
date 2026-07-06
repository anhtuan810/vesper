// Unit tests for timezone-safe diary date bucketing (pure, no I/O).
// Run:  npx tsx scripts/verify-diary-dates.ts
//
// Pin a west-of-UTC timezone (the failing case) BEFORE importing: a date-only
// string parsed via `new Date("2026-07-01")` is UTC midnight, which reads back as
// June 30 in a negative-offset zone — so a July-1 entry bucketed under "June" and
// dropped from the "1M" filter, while its own chip said "1 Jul". getMonthKey now
// reads the year-month straight off the string.
process.env.TZ = "America/New_York";

import { getMonthKey } from "../src/lib/utils";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log(`(timezone pinned to ${process.env.TZ})`);

console.log("getMonthKey reads the stored calendar month, not a timezone-shifted one:");
{
  check('"2026-07-01" → "2026-07"', getMonthKey("2026-07-01") === "2026-07", getMonthKey("2026-07-01"));
  check('"2026-01-01" → "2026-01"', getMonthKey("2026-01-01") === "2026-01", getMonthKey("2026-01-01"));
  check('"2026-12-31" → "2026-12"', getMonthKey("2026-12-31") === "2026-12", getMonthKey("2026-12-31"));
  check('ISO timestamp "2026-07-01T09:00:00Z" → "2026-07"', getMonthKey("2026-07-01T09:00:00Z") === "2026-07", getMonthKey("2026-07-01T09:00:00Z"));

  // Prove the bug is really timezone-driven here: the old implementation would
  // have shifted the first-of-month back a month in this zone.
  const buggy = (() => { const d = new Date("2026-07-01"); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; })();
  check("old new Date() path really did shift here (June)", buggy === "2026-06", buggy);
  check("fixed getMonthKey does NOT shift", getMonthKey("2026-07-01") !== buggy, `${getMonthKey("2026-07-01")} vs ${buggy}`);
}

console.log(failures === 0 ? "\nAll diary-date checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
