// Determinism tests for nearestHistoricalRate (pure, no I/O).
// Run:  npx tsx scripts/verify-nearest-fx-rate.ts
//
// Guards the "oldest date valued at today's live FX" bug (audit survivor #2). When
// a snapshot/swing date falls BEFORE the fetched FX series' earliest entry — which
// the shared, cross-user fx_rate_history cache can cause when it was first populated
// from a slightly later date, or when `earliest` is a non-trading day — the old
// historicalFxRate returned the LIVE rate (its currentFx fallback fired before any
// forward-fill). nearestHistoricalRate forward-fills to the nearest LATER historical
// entry first, so an old date is priced within a few days of its true rate, not at
// today's (which can be double-digit-percent off), and only uses the live rate when
// the series has nothing at all.

import { nearestHistoricalRate, historicalFxRate } from "../src/lib/fx";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// USD 1 EUR = 0.90 in 2021, 0.93 in 2026 (illustrative), live today = 0.93.
const series = {
  "2021-03-03": { EUR: 0.90, GBP: 0.78 },
  "2021-03-04": { EUR: 0.905, GBP: 0.781 },
  "2024-01-02": { EUR: 0.91, GBP: 0.79 },
};
const dates = Object.keys(series).sort();
const live = { EUR: 0.93, GBP: 0.82 };

console.log("At-or-before match: returns the real historical rate (unchanged behaviour)");
{
  check("exact date", nearestHistoricalRate(series, dates, "2021-03-03", "EUR", live) === 0.90);
  check("between entries carries forward the prior", nearestHistoricalRate(series, dates, "2021-06-01", "EUR", live) === 0.905, `${nearestHistoricalRate(series, dates, "2021-06-01", "EUR", live)}`);
  check("USD is always 1", nearestHistoricalRate(series, dates, "2021-06-01", "USD", live) === 1);
}

console.log("\nThe fix: a date BEFORE the series' earliest entry forward-fills, NOT live");
{
  // 2021-03-01 precedes the earliest entry (2021-03-03). Old code returned live (0.93).
  const r = nearestHistoricalRate(series, dates, "2021-03-01", "EUR", live);
  check("uses nearest LATER historical entry (0.90), not live (0.93)", r === 0.90, `${r}`);
  // Prove the divergence from the old behaviour on the exact same inputs.
  const old = historicalFxRate(series, dates, "2021-03-01", "EUR", live);
  check("old historicalFxRate returned the live rate here (the bug)", old === 0.93, `${old}`);
  check("nearestHistoricalRate differs from old for this pre-series date", r !== old);
}

console.log("\nLast resort: an empty series (nothing historical) → live rate");
{
  check("empty series → live", nearestHistoricalRate({}, [], "2021-03-01", "EUR", live) === 0.93);
  check("empty series, currency absent from live → null", nearestHistoricalRate({}, [], "2021-03-01", "SEK", live) === null);
}

console.log("\nForward-fill skips a currency missing on the nearest date, finds it on a later one");
{
  const sparse = { "2021-03-03": { GBP: 0.78 }, "2021-03-10": { EUR: 0.90 } };
  const sd = Object.keys(sparse).sort();
  // EUR asked for 2021-03-01: not at/before, not on 03-03 (only GBP), found on 03-10.
  check("finds EUR on the later date it first appears", nearestHistoricalRate(sparse, sd, "2021-03-01", "EUR", live) === 0.90, `${nearestHistoricalRate(sparse, sd, "2021-03-01", "EUR", live)}`);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
