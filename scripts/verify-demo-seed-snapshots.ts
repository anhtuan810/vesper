// Behaviour tests for the demo seed's snapshot series (pure, no I/O).
// Run:  npx tsx scripts/verify-demo-seed-snapshots.ts
//
// Guards the endless-spinner regression: the series used to end at a HARDCODED
// month (2026-06-01), so once today drifted past it a fresh demo reseed had no
// rows inside dashboard-init's trailing 30-day window — hasHistory came back
// false, building:true, and the client's watch spun forever because
// backfillSnapshots (correctly) refuses to reconstruct demo accounts. The fix
// extends the series RELATIVE to the reseed moment: monthly rows to the latest
// month boundary plus recent in-window points, always ending before today.
// These tests reseed "as of" dates years apart to prove the fix cannot decay.

// demo-seed transitively imports market-highlights, whose module scope
// instantiates the Anthropic SDK client — it throws without a key. Nothing in
// this suite calls it; a dummy satisfies the constructor, keeping the suite
// hermetic. Env must be set BEFORE the module loads, hence the dynamic import.
process.env.ANTHROPIC_API_KEY ||= "verify-suite-dummy";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const USER = "demo-user";
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const DAY = 86_400_000;

interface Row { date: string; total_value: number; breakdown: Record<string, number>; native_breakdown: Record<string, number> }

// The newest anchor's liquid sleeve the INVARIANT pins the series tail to
// (etf 36000 + stocks 42000 + crypto 12700 — see SNAPSHOT_ANCHORS).
const ANCHOR_LIQUID = 90700;
const liquid = (r: Row) => (r.breakdown.etf ?? 0) + (r.breakdown.stocks ?? 0) + (r.breakdown.crypto ?? 0);

// Reseed moments: just past the last fixed anchor, the original incident date
// (2026-07), and far-future dates including a 1st-of-month edge case.
const AS_OF = [
  Date.parse("2026-06-15T09:30:00Z"),
  Date.parse("2026-07-10T14:00:00Z"),
  Date.parse("2026-12-01T00:30:00Z"), // month boundary == today: must be skipped
  Date.parse("2027-03-22T18:00:00Z"),
  Date.parse("2031-08-05T11:00:00Z"),
];

async function main() {
const { snapshotRows } = await import("../src/lib/demo-seed");
const rowsAt = (nowMs: number): Row[] => snapshotRows(USER, nowMs) as unknown as Row[];

for (const nowMs of AS_OF) {
  const today = iso(nowMs);
  console.log(`\nReseed as of ${today}`);
  const rows = rowsAt(nowMs);
  const dates = rows.map((r) => r.date);

  check("dates strictly ascending, no duplicates",
    dates.every((d, i) => i === 0 || d > dates[i - 1]));

  check("no row dated today or later (the live tip owns today)",
    dates.every((d) => d < today), `last=${dates[dates.length - 1]}`);

  const windowStart = iso(nowMs - 30 * DAY);
  const inWindow = dates.filter((d) => d >= windowStart);
  check("rows inside the trailing 30-day window (dashboard-init's hasHistory)",
    inWindow.length >= 2, `found ${inWindow.length} since ${windowStart}`);

  const last = rows[rows.length - 1];
  check("newest row's liquid sleeve stays ≈ the newest anchor's (INVARIANT)",
    Math.abs(liquid(last) - ANCHOR_LIQUID) <= 1500,
    `liquid=${liquid(last)} vs anchor=${ANCHOR_LIQUID}`);

  const gaps = dates.map((d, i) =>
    i === 0 ? 0 : (Date.parse(d) - Date.parse(dates[i - 1])) / DAY);
  check("no gap over ~one month anywhere in the series",
    gaps.every((g) => g <= 32), `max gap=${Math.max(...gaps)}d`);

  check("totals consistent (total = sum of breakdown = EUR native bucket)",
    rows.every((r) =>
      r.total_value === Object.values(r.breakdown).reduce((a, b) => a + b, 0) &&
      r.native_breakdown.EUR === r.total_value));

  check("fixed anchor history untouched (starts 2021-01-01, monthly firsts)",
    dates[0] === "2021-01-01" &&
    dates.includes("2026-06-01") &&
    dates.filter((d) => d <= "2026-06-01").every((d) => d.slice(8) === "01"));

  check("deterministic for a given reseed moment",
    JSON.stringify(rows) === JSON.stringify(rowsAt(nowMs)));
}

console.log("");
if (failures > 0) {
  console.error(`✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log("✓ all demo-seed snapshot checks passed");
}

main().catch((e) => { console.error(e); process.exit(1); });

// Top-level export makes this file a module, so its `main` doesn't collide
// with other plain scripts/ files in the global typecheck scope.
export {};
