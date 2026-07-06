// Unit tests for holding-count formatting (pure, no I/O).
// Run:  npx tsx scripts/verify-format-units.ts
//
// Locks the confirmed bug where a fractional crypto/share count rendered as
// "+0 units": the plain nl-NL format caps at 3 decimals, so a value-mode
// 0.00022222 BTC buy (stored at 8 dp) collapsed to "0" in the Diary, the
// Overview and the asset Activity.

import { formatUnits } from "../src/lib/utils";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

check('0.00022222 BTC is not "0"', formatUnits(0.00022222) === "0,00022222", formatUnits(0.00022222));
check('0.0234 keeps its digits', formatUnits(0.0234) === "0,0234", formatUnits(0.0234));
check("whole counts stay clean", formatUnits(20) === "20", formatUnits(20));
check("large whole counts group", formatUnits(1500) === "1.500", formatUnits(1500));
check("no trailing zeros", formatUnits(0.5) === "0,5", formatUnits(0.5));
check("fractional shares", formatUnits(150.25) === "150,25", formatUnits(150.25));
check("a tiny sat-level amount still shows", formatUnits(0.00000001) === "0,00000001", formatUnits(0.00000001));
check("zero renders as 0", formatUnits(0) === "0", formatUnits(0));

console.log(failures === 0 ? "\nAll format-units checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
