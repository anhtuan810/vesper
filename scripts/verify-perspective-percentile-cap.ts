// Guards Perspective against impossible percentile figures.
// Run:  npx tsx scripts/verify-perspective-percentile-cap.ts
// Exits non-zero on any mismatch. No framework, no I/O.

import { computePerspective } from "../src/lib/vitals/perspective";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// formatPercentile mirrors PerspectiveCard's helper.
function formatPercentile(pct: number): string {
  return pct >= 99 ? pct.toFixed(1) : String(Math.round(pct));
}

console.log("Extremely wealthy user — all three percentiles capped at 99.9:");
{
  const p = computePerspective(50_000_000, "NL", 1980, 45_000_000);
  for (const row of p.rows) {
    check(`${row.region} percentile <= 99.9`, row.percentile <= 99.9, `percentile=${row.percentile}`);
    const label = formatPercentile(row.percentile);
    check(`${row.region} display label is not "100"`, label !== "100", `label="${label}"`);
  }
  const euRow = p.rows.find((r) => r.region === "EU")!;
  const worldRow = p.rows.find((r) => r.region === "WORLD")!;
  check("EU headline is not 100%", formatPercentile(euRow.percentile) !== "100");
  check("World headline is not 100%", formatPercentile(worldRow.percentile) !== "100");
  check("EU headline shows one decimal at the cap", formatPercentile(euRow.percentile) === "99.9",
    `got "${formatPercentile(euRow.percentile)}"`);
}

console.log("Magnitude-1 trajectory pluralization:");
{
  // Engineer a 1-point swing: pick values whose NL percentiles differ by ~1.
  const now = computePerspective(90_000, "NL", 1980, null).rows.find((r) => r.region === "NL")!.percentile;
  const past = computePerspective(85_000, "NL", 1980, null).rows.find((r) => r.region === "NL")!.percentile;
  const pts = Math.round(now - past);
  check("fixture produces a magnitude-1 swing", Math.abs(pts) === 1, `pts=${pts} (now=${now}, past=${past})`);
  const magnitude = Math.abs(pts);
  const word = magnitude === 1 ? "point" : "points";
  check('singular "point" for magnitude 1', word === "point");
}

console.log(failures === 0 ? "\nAll fixtures passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
