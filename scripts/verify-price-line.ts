// Unit tests for the live-quote line formatter (pure; no network).
// The price always comes from the market feed — this only checks the rendering:
// the day-move sign/percent, the "no previous close → no day-move" path, and the
// native-currency handling (€/$/£ via formatMoney, any other ISO code passed through).
// Run:  npx tsx scripts/verify-price-line.ts

import { formatPriceLine } from "../src/lib/price-line";
import type { PriceResult } from "../src/lib/prices-server";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const quote = (over: Partial<PriceResult>): PriceResult => ({
  symbol: "X", price: 0, previousClose: 0, nativePrice: 0, nativeCurrency: "USD", ...over,
});

console.log("Live-quote line formatter:");
{
  // Gain — EUR listing, up 1,32% on the day (nl-NL decimals, U+002B sign).
  const up = formatPriceLine("Infineon", quote({ price: 38.5, previousClose: 38.0, nativeCurrency: "EUR" }));
  check("bolds the asset name", up.includes("**Infineon**"), up);
  check("says 'trading at'", up.includes("is trading at"), up);
  check("gain shows +1,32% on the day", up.includes("(+1,32% on the day)"), up);

  // Loss — uses the real minus sign (U+2212), not an ASCII hyphen.
  const down = formatPriceLine("Apple", quote({ price: 38.0, previousClose: 38.5, nativeCurrency: "USD" }));
  check("loss shows −1,30% on the day (U+2212)", down.includes("(−1,30% on the day)"), down);
  check("loss does NOT use ASCII hyphen for the move", !down.includes("(-1,30%"), down);

  // No previous close → no day-move clause at all (never a fabricated 0%).
  const flat = formatPriceLine("SpaceX", quote({ price: 161, previousClose: 0, nativeCurrency: "USD" }));
  check("no previous close → omits 'on the day'", !flat.includes("on the day"), flat);

  // Unsupported currency (no €/$/£) → plain number + ISO code, never a wrong symbol.
  const chf = formatPriceLine("Nestlé", quote({ price: 95.2, previousClose: 94.0, nativeCurrency: "CHF" }));
  check("foreign currency renders the ISO code", chf.includes("CHF"), chf);
  check("foreign currency keeps the number", chf.includes("95"), chf);

  // Always offers the next step, staying within scope (add / what-if, not advice).
  check("closes with an actionable, non-advice offer", up.includes("add a position or run a what-if"), up);
}

console.log(failures === 0 ? "\nAll price-line checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
