// Unit tests for the Decision Verdict's pure core (no I/O, no DB, no network).
// Run:  npx tsx scripts/verify-decision-verdict.ts
//
// The verdict answers "was selling this stake right?" by valuing the sold units
// then vs now from real historical prices (reconstructPositionSeries, tested in
// verify-counterfactual-engine.ts). This suite guards the two pieces of judgement
// layered on top: the direction/magnitude (classifyVerdict) and the calm,
// single-unit lookback phrasing (lookbackLabel). Both must be deterministic — the
// product promise is that no model invents the figure or the framing.

import { classifyVerdict, classifyBuyVerdict, lookbackLabel } from "../src/lib/scenario/decision-verdict";
import { reconstructPositionSeries } from "../src/lib/scenario/counterfactual";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("Direction — a sell is 'spared' when the stake fell, 'missed' when it rose:");
{
  // Sold 10 units worth $1000, now worth $800 → selling spared $200.
  const fell = classifyVerdict(1000, 800);
  check("fell → spared", fell.kind === "spared", fell.kind);
  check("fell → magnitude 200", fell.magnitudeUsd === 200, String(fell.magnitudeUsd));

  // Sold 10 units worth $1000, now worth $1300 → holding would have gained $300.
  const rose = classifyVerdict(1000, 1300);
  check("rose → missed", rose.kind === "missed", rose.kind);
  check("rose → magnitude 300", rose.magnitudeUsd === 300, String(rose.magnitudeUsd));
}

console.log("A wash within 1% of the basis reads 'even', not a verdict either way:");
{
  check("then 1000 / now 1005 → even (0.5%)", classifyVerdict(1000, 1005).kind === "even");
  check("then 1000 / now 995 → even (0.5%)", classifyVerdict(1000, 995).kind === "even");
  // Just over the 1% band tips to a real verdict.
  check("then 1000 / now 1020 → missed (2%)", classifyVerdict(1000, 1020).kind === "missed");
  check("then 1000 / now 980 → spared (2%)", classifyVerdict(1000, 980).kind === "spared");
  // Tiny basis: the $1 floor keeps sub-dollar noise from registering.
  check("then 10 / now 10.50 → even (<$1)", classifyVerdict(10, 10.5).kind === "even");
}

console.log("Buy verdict — the active bet vs the same money in the index:");
{
  // Deployed $1000; the index would have grown it to $1200. Position now $1500 →
  // the pick beat the index by $300.
  const beat = classifyBuyVerdict(1500, 1200, 1000);
  check("position 1500 vs index 1200 → beat 300", beat.kind === "beat" && beat.magnitudeUsd === 300, `${beat.kind} ${beat.magnitudeUsd}`);
  // Position now $1000, index would be $1200 → trailed by $200.
  const trailed = classifyBuyVerdict(1000, 1200, 1000);
  check("position 1000 vs index 1200 → trailed 200", trailed.kind === "trailed" && trailed.magnitudeUsd === 200, `${trailed.kind} ${trailed.magnitudeUsd}`);
  // Within the 3% band of the $1000 deployed → matched, not a verdict either way.
  check("position 1210 vs index 1200 → matched (1% gap)", classifyBuyVerdict(1210, 1200, 1000).kind === "matched");
  check("position 1175 vs index 1200 → matched (2.5% gap)", classifyBuyVerdict(1175, 1200, 1000).kind === "matched");
  // Just past the 3% band tips to a real verdict.
  check("position 1240 vs index 1200 → beat (4% gap)", classifyBuyVerdict(1240, 1200, 1000).kind === "beat");
}

console.log("Lookback phrasing — calm, single-unit, no decimals:");
{
  check("21 days → '3 weeks on'", lookbackLabel(21) === "3 weeks on", lookbackLabel(21));
  check("56 days → '8 weeks on'", lookbackLabel(56) === "8 weeks on", lookbackLabel(56));
  check("90 days → '3 months on'", lookbackLabel(90) === "3 months on", lookbackLabel(90));
  check("548 days → '18 months on'", lookbackLabel(548) === "18 months on", lookbackLabel(548));
  check("365 days → '12 months on'", lookbackLabel(365) === "12 months on", lookbackLabel(365));
  // Months carry up to 24 (the brand says "18 months on", never "1.5 years on").
  check("400 days → '13 months on'", lookbackLabel(400) === "13 months on", lookbackLabel(400));
  check("760 days → '2 years on'", lookbackLabel(760) === "2 years on", lookbackLabel(760));
  check("1100 days → '3 years on'", lookbackLabel(1100) === "3 years on", lookbackLabel(1100));
}

console.log("End-to-end with the real engine — sold stake valued then vs now:");
{
  // 10 units of a USD instrument; price 100 on the sell date, 80 today.
  const prices = [
    { date: "2024-01-01", price: 100, currency: "USD" },
    { date: "2025-01-01", price: 80, currency: "USD" },
  ];
  const { series } = reconstructPositionSeries(["2024-01-01", "2025-01-01"], 10, prices, {});
  const thenUsd = series[0].valueUsd;
  const nowUsd = series[1].valueUsd;
  check("then = 10 × 100 = 1000", thenUsd === 1000, String(thenUsd));
  check("now  = 10 × 80  = 800", nowUsd === 800, String(nowUsd));
  const v = classifyVerdict(thenUsd, nowUsd);
  check("verdict → spared 200 (a fall the sell avoided)", v.kind === "spared" && v.magnitudeUsd === 200, `${v.kind} ${v.magnitudeUsd}`);
}

console.log("FX-missing guard — the engine flags an unconvertible non-USD holding:");
{
  // assembleVerdict bails when the engine couldn't apply FX (it would otherwise
  // mislabel a native amount as USD and double-convert). This anchors the exact
  // substring that bail matches to the engine's real output, so it can't drift.
  const eurPrices = [
    { date: "2024-01-01", price: 100, currency: "EUR" },
    { date: "2025-01-01", price: 90, currency: "EUR" },
  ];
  const { assumptions } = reconstructPositionSeries(["2024-01-01", "2025-01-01"], 10, eurPrices, {}); // empty FX
  check(
    "non-USD price + empty FX → 'FX unavailable' assumption present",
    assumptions.some((a) => a.includes("FX unavailable")),
    assumptions.join(" | "),
  );
  // A USD-priced holding never needs FX, so the marker must be absent (no false bail).
  const usdPrices = [
    { date: "2024-01-01", price: 100, currency: "USD" },
    { date: "2025-01-01", price: 90, currency: "USD" },
  ];
  const usd = reconstructPositionSeries(["2024-01-01", "2025-01-01"], 10, usdPrices, {});
  check("USD price → no 'FX unavailable' marker (no false bail)", !usd.assumptions.some((a) => a.includes("FX unavailable")));
}

console.log("\n" + "=".repeat(60));
if (failures > 0) {
  console.log(`✗ ${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("✓ All Decision Verdict assertions passed");
