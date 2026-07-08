// Determinism tests for planPriceFetch — the pure planner behind the persistent
// price-history cache (no I/O). Run:  npx tsx scripts/verify-price-cache-plan.ts
//
// The planner decides, from the dates already cached for a symbol, whether a live
// Yahoo fetch is needed and how much of it. The whole point of the cache is that a
// symbol's deep, immutable history is fetched ONCE and only the recent (still-
// settling) tail is ever re-fetched — so these guards pin that behaviour:
//   • empty / gappy cache        → fetch the whole requested range
//   • settled history fully cached, request ends before the live tail → NO fetch
//   • settled cached, tail requested → fetch ONLY the tail, reuse cached history

import { planPriceFetch } from "../src/lib/price-history-cache";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const TODAY = "2026-07-08";
// Mirrors the module's constants: LIVE_TAIL_DAYS = 5 → liveCutoff = 2026-07-03;
// the tail fetch starts 7 days before that = 2026-06-26.
const LIVE_CUTOFF = "2026-07-03";
const TAIL_FROM = "2026-06-26";

// A dense daily cache spanning years up to just before the live tail.
function densishCache(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 3); // every 3rd day — within the 5-day NEAR window
  }
  return out;
}

console.log("Empty cache → fetch the whole requested range");
{
  const p = planPriceFetch([], "2020-01-01", TODAY, TODAY);
  check("fetchFrom = requested from", p.fetchFrom === "2020-01-01", `${p.fetchFrom}`);
  check("fetchTo = requested to", p.fetchTo === TODAY, `${p.fetchTo}`);
  check("no cache reuse", p.useCacheBefore === null);
}

console.log("\nSettled history cached, request runs to today → fetch ONLY the tail");
{
  const cache = densishCache("2020-01-01", "2026-07-02");
  const p = planPriceFetch(cache, "2020-01-01", TODAY, TODAY);
  check("fetches only the recent tail", p.fetchFrom === TAIL_FROM, `${p.fetchFrom}`);
  check("tail runs to today", p.fetchTo === TODAY, `${p.fetchTo}`);
  check("reuses cached history before the live cutoff", p.useCacheBefore === LIVE_CUTOFF, `${p.useCacheBefore}`);
}

console.log("\nEntirely-historical request, fully cached → NO fetch at all");
{
  const cache = densishCache("2020-01-01", "2023-01-05");
  const p = planPriceFetch(cache, "2020-01-01", "2023-01-01", TODAY);
  check("no live fetch needed", p.fetchFrom === null && p.fetchTo === null, `${p.fetchFrom}..${p.fetchTo}`);
}

console.log("\nCache far from the requested start → refetch the whole range");
{
  // Only recent rows cached; the deep history the request needs is absent.
  const cache = densishCache("2026-06-01", "2026-07-02");
  const p = planPriceFetch(cache, "2020-01-01", TODAY, TODAY);
  check("fetchFrom falls back to requested from", p.fetchFrom === "2020-01-01", `${p.fetchFrom}`);
  check("no cache reuse when settled history is uncovered", p.useCacheBefore === null);
}

console.log("\nNEAR tolerance: a cached row within 5 days of the settled end counts as covered");
{
  // Settled end is the live cutoff (2026-07-03); nearest cached row is 2026-06-29 (4 days).
  const cache = [...densishCache("2020-01-01", "2026-06-20"), "2026-06-29"];
  const covered = planPriceFetch(cache, "2020-01-01", TODAY, TODAY);
  check("4-day gap at the settled end is covered → tail-only fetch", covered.fetchFrom === TAIL_FROM, `${covered.fetchFrom}`);

  // Now the nearest row is 2026-06-26 (7 days from the cutoff) → NOT near → refetch whole.
  const gappy = [...densishCache("2020-01-01", "2026-06-20"), "2026-06-26"];
  const notCovered = planPriceFetch(gappy, "2020-01-01", TODAY, TODAY);
  check("7-day gap at the settled end is NOT covered → full refetch", notCovered.fetchFrom === "2020-01-01" && notCovered.useCacheBefore === null, `${notCovered.fetchFrom}`);
}

console.log("\nTail fetch never starts after the requested start (short recent request)");
{
  // A request that itself begins inside the tail window: fetchFrom must be the
  // requested from, not the earlier tail margin.
  const cache = densishCache("2026-06-28", "2026-07-02");
  const p = planPriceFetch(cache, "2026-06-30", TODAY, TODAY);
  check("fetchFrom clamps to the requested start", p.fetchFrom === "2026-06-30", `${p.fetchFrom}`);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
