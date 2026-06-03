// Unit tests for the market-symbol resolver's pure core (no network).
// Run:  npx tsx scripts/verify-resolve-market-symbol.ts

import { resolveMarketSymbolLocal } from "../src/lib/scenario/resolve-market-symbol";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("Market-symbol resolver (local):");
{
  const btc = resolveMarketSymbolLocal("BTC");
  check('"BTC" → resolved BTC-USD', btc.kind === "resolved" && btc.symbol === "BTC-USD", JSON.stringify(btc));

  const bitcoin = resolveMarketSymbolLocal("Bitcoin");
  check('"Bitcoin" → resolved BTC-USD', bitcoin.kind === "resolved" && bitcoin.symbol === "BTC-USD", JSON.stringify(bitcoin));

  const nvda = resolveMarketSymbolLocal("NVDA");
  check('"NVDA" → resolved NVDA (direct ticker)', nvda.kind === "resolved" && nvda.symbol === "NVDA", JSON.stringify(nvda));

  const nvidia = resolveMarketSymbolLocal("nvidia");
  check('"nvidia" → resolved NVDA (alias)', nvidia.kind === "resolved" && nvidia.symbol === "NVDA", JSON.stringify(nvidia));

  const gibberish = resolveMarketSymbolLocal("zxqwvplt");
  check('gibberish "zxqwvplt" → none (defers to search/clarify)', gibberish.kind === "none", JSON.stringify(gibberish));

  const google = resolveMarketSymbolLocal("Google");
  check('"Google" → ambiguous (GOOGL / GOOG)', google.kind === "ambiguous" && google.candidates.length === 2, JSON.stringify(google));

  const empty = resolveMarketSymbolLocal("   ");
  check("blank hint → none", empty.kind === "none", JSON.stringify(empty));
}

console.log(failures === 0 ? "\nAll resolver checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
