// Determinism tests for earliestHeldBySymbol (pure, no I/O).
// Run:  npx tsx scripts/verify-earliest-held-by-symbol.ts
//
// Guards the fix for audit survivor #1: the persistent price cache must fetch each
// symbol from its OWN earliest-held date, not the portfolio's single global
// `earliest`. Otherwise a symbol younger than the oldest holding (an IPO/listing
// after `earliest`) never has a cached row near `from`, so the cache re-pulls its
// full history on every cold rebuild instead of tail-only. The value returned here
// must never be LATER than any date the symbol can be held (units > 0) — fetching
// too late would leave held dates without a price (correctness bug), so these
// assertions pin the conservative lower bound.

import { earliestHeldBySymbol } from "../src/lib/snapshot";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const asset = (id: string, symbol: string, created_at: string, type = "stocks") => ({ id, symbol, type, created_at });

console.log("Symbol with a unit timeline → earliest timeline entry (not the global earliest)");
{
  const assets = [asset("a1", "AAPL", "2026-01-01T00:00:00Z")];
  const muts = new Map([["a1", [{ date: "2021-03-15" }, { date: "2022-06-01" }]]]);
  const acq = new Map([["a1", "2021-03-15"]]);
  const m = earliestHeldBySymbol(assets, muts, acq);
  check("AAPL keyed to its first timeline date", m.get("AAPL") === "2021-03-15", `${m.get("AAPL")}`);
}

console.log("\nNo timeline → acquisition (add-mutation date), else created_at");
{
  const assets = [asset("a1", "TSLA", "2026-01-01T00:00:00Z"), asset("a2", "NVDA", "2020-05-05T00:00:00Z")];
  const muts = new Map<string, Array<{ date: string }>>(); // no timelines
  const acq = new Map([["a1", "2023-07-10"]]); // TSLA has an acquisition; NVDA has none
  const m = earliestHeldBySymbol(assets, muts, acq);
  check("TSLA → acquisition date", m.get("TSLA") === "2023-07-10", `${m.get("TSLA")}`);
  check("NVDA → created_at (no acquisition)", m.get("NVDA") === "2020-05-05", `${m.get("NVDA")}`);
}

console.log("\nTwo lots of the same symbol → the MINIMUM across them (conservative)");
{
  const assets = [asset("a1", "MSFT", "2026-01-01T00:00:00Z"), asset("a2", "MSFT", "2026-01-01T00:00:00Z")];
  const muts = new Map([
    ["a1", [{ date: "2019-02-02" }]],
    ["a2", [{ date: "2024-11-11" }]],
  ]);
  const acq = new Map<string, string>();
  const m = earliestHeldBySymbol(assets, muts, acq);
  check("MSFT → the earlier lot's date", m.get("MSFT") === "2019-02-02", `${m.get("MSFT")}`);
}

console.log("\nNon-tradeables and symbol-less rows are ignored");
{
  const assets = [
    { id: "p1", symbol: null, type: "real_estate", created_at: "2015-01-01T00:00:00Z" },
    { id: "c1", symbol: null, type: "cash", created_at: "2015-01-01T00:00:00Z" },
    asset("a1", "ETH", "2026-01-01T00:00:00Z", "crypto"),
  ];
  const muts = new Map([["a1", [{ date: "2022-01-01" }]]]);
  const m = earliestHeldBySymbol(assets, muts, new Map());
  check("only the crypto symbol is present", m.size === 1 && m.get("ETH") === "2022-01-01", `size=${m.size}`);
}

console.log("\nConservative bound: result is never later than a held date");
{
  // A null-dated starting position is placed at the global earliest by the caller,
  // so its timeline entry already carries that date — the helper picks it up.
  const assets = [asset("a1", "SPY", "2026-01-01T00:00:00Z")];
  const globalEarliest = "2016-04-04";
  const muts = new Map([["a1", [{ date: globalEarliest }]]]); // null-dated → placed at earliest
  const m = earliestHeldBySymbol(assets, muts, new Map());
  check("null-dated position anchors to the global earliest (not created_at)", m.get("SPY") === globalEarliest, `${m.get("SPY")}`);
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
