// Unit tests for historizing the mortgage balance (pure, no I/O).
// Run:  npx tsx scripts/verify-mortgage-history.ts
//
// Locks the confirmed bug: past net-worth equity used TODAY's mortgage balance,
// so a lump-sum paydown made every historical row before it overstate equity.
// historizeBalanceSampler adds the discrete (non-amortisation) part of each
// recorded balance change back for dates before it — and, crucially, is a NO-OP
// when there are no recorded balances (so all existing data is byte-identical)
// and does NOT double-count ordinary amortisation.

import { historizeBalanceSampler } from "../src/lib/snapshot";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}
const near = (a: number, b: number, eps = 1) => Math.abs(a - b) < eps;

// A simple linear schedule: balance falls 1,000/month from 300,000 at 2020-01.
// (Stand-in for projectMortgage's curve — the historization only needs a sampler.)
const monthsSince = (date: string) => {
  const [y, m] = date.split("-").map(Number);
  return (y - 2020) * 12 + (m - 1);
};
const schedule = (date: string) => Math.max(0, 300_000 - 1_000 * monthsSince(date));

console.log("No recorded balances → identical to the schedule (existing data unchanged):");
{
  const s = historizeBalanceSampler(schedule, []);
  check("2021-01 unchanged", s("2021-01-01") === schedule("2021-01-01"), String(s("2021-01-01")));
  check("same function returned (no wrapping)", s === schedule);
}

console.log("A lump-sum paydown steps the history BEFORE the paydown up:");
{
  // Schedule says 2024-01 balance ≈ 300000 − 48*1000 = 252,000. Suppose the user
  // paid a 50,000 lump sum at 2024-01, so the CURRENT (post-paydown) schedule is
  // anchored 50k lower — model that by shifting the schedule down 50k after the
  // event and recording the two balances.
  const postPaydownSchedule = (date: string) => Math.max(0, schedule(date) - 50_000);
  const points = [
    { date: "2020-01-01", balance: 300_000 }, // at acquisition
    { date: "2024-01-01", balance: 202_000 }, // after the 50k paydown (252k − 50k)
  ];
  const s = historizeBalanceSampler(postPaydownSchedule, points);

  // After the paydown: follows the (post-paydown) schedule, no adjustment.
  check("today (post-paydown) unchanged", near(s("2025-01-01"), postPaydownSchedule("2025-01-01")), `${s("2025-01-01")} vs ${postPaydownSchedule("2025-01-01")}`);
  // Before the paydown: the 50k is added back → matches the ORIGINAL schedule.
  check("2022-01 adds the 50k back (≈ original schedule)", near(s("2022-01-01"), schedule("2022-01-01")), `${s("2022-01-01")} vs ${schedule("2022-01-01")}`);
  check("2022-01 is 50k above the post-paydown schedule", near(s("2022-01-01") - postPaydownSchedule("2022-01-01"), 50_000), String(s("2022-01-01") - postPaydownSchedule("2022-01-01")));
}

console.log("Ordinary amortisation is NOT treated as a discrete step (no double-count):");
{
  // The user restates the balance to what the schedule already implies (pure
  // amortisation, no lump sum) → no step, history unchanged.
  const points = [
    { date: "2020-01-01", balance: 300_000 },
    { date: "2023-01-01", balance: schedule("2023-01-01") }, // exactly the amortised value
  ];
  const s = historizeBalanceSampler(schedule, points);
  check("2021-06 unchanged (amortisation only)", near(s("2021-06-01"), schedule("2021-06-01")), `${s("2021-06-01")} vs ${schedule("2021-06-01")}`);
}

console.log("A redraw (balance goes UP) steps earlier history DOWN:");
{
  const postDrawSchedule = (date: string) => schedule(date) + 20_000; // anchored higher after a 20k redraw
  const points = [
    { date: "2020-01-01", balance: 300_000 },
    { date: "2023-06-01", balance: schedule("2023-06-01") + 20_000 }, // +20k redraw
  ];
  const s = historizeBalanceSampler(postDrawSchedule, points);
  check("before the redraw, balance is 20k lower than the post-draw schedule", near(s("2021-01-01") - postDrawSchedule("2021-01-01"), -20_000), String(s("2021-01-01") - postDrawSchedule("2021-01-01")));
}

console.log(failures === 0 ? "\nAll mortgage-history checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
