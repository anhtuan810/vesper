// Unit tests for market-swing detection (pure, no I/O).
// Run:  npx tsx scripts/verify-detect-swings.ts
//
// Locks the confirmed bug where the earliest in-window swing was dropped: it sat
// at index 0 with prior=null (no prior trading day) and was filtered out even
// though its real prior close existed in the fetched series. detectSwings now
// takes a small buffer of pre-window rows purely to supply that prior.

import { detectSwings, type IndexMoveSeries } from "../src/lib/diary-market-moves";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const THRESHOLD = 2.0;
const cutoff = "2023-06-05";

console.log("The earliest in-window swing keeps a real prior (was dropped):");
{
  // Two pre-window rows, then the first in-window day is a −2.4% swing.
  const nasdaq: IndexMoveSeries = {
    symbol: "^IXIC", label: "Nasdaq",
    rows: [
      { date: "2023-06-01", pct_change: 0.3 },  // pre-window (Thu)
      { date: "2023-06-02", pct_change: 0.5 },  // pre-window (Fri) — the prior
      { date: "2023-06-05", pct_change: -2.4 }, // first in-window day (Mon) — a swing
      { date: "2023-06-06", pct_change: 0.1 },
    ],
  };
  const swings = detectSwings([nasdaq], cutoff, THRESHOLD);
  const first = swings.get("2023-06-05");
  check("the first in-window swing is detected", !!first);
  check("…with a real prior (the last pre-window trading day)", first?.prior === "2023-06-02", String(first?.prior));
  check("prior is NOT null", first?.prior !== null);
}

console.log("Pre-window rows are never themselves emitted as swings:");
{
  const s: IndexMoveSeries = {
    symbol: "^GSPC", label: "S&P 500",
    rows: [
      { date: "2023-06-02", pct_change: -3.0 }, // pre-window BIG move — must NOT be detected
      { date: "2023-06-05", pct_change: 2.5 },  // in-window swing
    ],
  };
  const swings = detectSwings([s], cutoff, THRESHOLD);
  check("pre-window −3% is excluded", !swings.has("2023-06-02"));
  check("in-window +2.5% is included", swings.has("2023-06-05"));
}

console.log("Dedup across indices keeps the largest move that day:");
{
  const nasdaq: IndexMoveSeries = { symbol: "^IXIC", label: "Nasdaq", rows: [{ date: "2023-06-05", pct_change: -2.1 }, { date: "2023-06-06", pct_change: -2.5 }] };
  const aex: IndexMoveSeries = { symbol: "^AEX", label: "AEX", rows: [{ date: "2023-06-05", pct_change: -3.2 }, { date: "2023-06-06", pct_change: -1.0 }] };
  const swings = detectSwings([nasdaq, aex], cutoff, THRESHOLD);
  check("2023-06-05 attributed to AEX (−3.2 beats −2.1)", swings.get("2023-06-05")?.index_label === "AEX", swings.get("2023-06-05")?.index_label);
  check("2023-06-06 attributed to Nasdaq (−2.5 beats −1.0)", swings.get("2023-06-06")?.index_label === "Nasdaq");
}

console.log("Sub-threshold days are ignored:");
{
  const s: IndexMoveSeries = { symbol: "^IXIC", label: "Nasdaq", rows: [{ date: "2023-06-05", pct_change: 1.9 }, { date: "2023-06-06", pct_change: -1.99 }] };
  check("nothing detected below 2%", detectSwings([s], cutoff, THRESHOLD).size === 0);
}

console.log(failures === 0 ? "\nAll detect-swings checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
