// Unit test for the chat scenario asset resolver (the deterministic part of the
// chat-initiated counterfactual branch). No LLM, no DB.
// Run:  npx tsx scripts/verify-scenario-resolve.ts

import { resolveScenarioAsset, type AssetRef } from "../src/lib/scenario/resolve-asset";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const assets: AssetRef[] = [
  { id: "1", name: "Bitcoin", type: "crypto", symbol: "BTC" },
  { id: "2", name: "Ethereum", type: "crypto", symbol: "ETH" },
  { id: "3", name: "Apple", type: "stocks", symbol: "AAPL" },
  { id: "4", name: "Family home", type: "real_estate", symbol: null },
];

console.log("Resolver — retrospective references resolve to one held tradeable:");
{
  const a = resolveScenarioAsset(assets, "Bitcoin");
  check('"Bitcoin" → resolved Bitcoin', a.kind === "resolved" && a.asset.id === "1");
  const b = resolveScenarioAsset(assets, "BTC");
  check('"BTC" → resolved Bitcoin (by ticker)', b.kind === "resolved" && b.asset.id === "1");
  const c = resolveScenarioAsset(assets, "apple");
  check('"apple" → resolved Apple', c.kind === "resolved" && c.asset.id === "3");
}

console.log("Resolver — ambiguous reference asks to disambiguate:");
{
  const a = resolveScenarioAsset(assets, "crypto");
  check('"crypto" (Bitcoin + Ethereum) → ambiguous', a.kind === "ambiguous" && a.kind === "ambiguous" && a.matches.length === 2);
}

console.log("Resolver — non-tradeable / not-held get a graceful kind:");
{
  const a = resolveScenarioAsset(assets, "Family home");
  check('"Family home" → non_tradeable', a.kind === "non_tradeable");
  const b = resolveScenarioAsset(assets, "Tesla");
  check('"Tesla" (not held) → none', b.kind === "none");
}

console.log(failures === 0 ? "\nAll resolver checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
