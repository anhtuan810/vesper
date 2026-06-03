// Unit test for the narration numeric guardrail. No LLM call.
// Run:  npx tsx scripts/verify-narration-guardrail.ts
// Exits non-zero on any mismatch.

import { extractNumbers, validateNarration } from "../src/lib/narrate/guardrail";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const allowed = ["€207.488", "44%", "27%", "10"];

console.log("Guardrail — extractNumbers:");
{
  const nums = extractNumbers("Net worth €207.488, concentration 44% → 27%, over 10 years.");
  check("extracts currency, percents, plain", ["€207.488", "44%", "27%", "10"].every((t) => nums.includes(t)), nums.join(" "));
}

console.log("Guardrail — clean narration passes:");
{
  const clean = "Your net worth holds at €207.488, while single-name concentration eases from 44% to 27% over 10 years.";
  check("all numbers in the allowed set → valid", validateNarration(clean, allowed) === true);
}

console.log("Guardrail — drifted narration fails:");
{
  // 45% is NOT in the allowed set (the model rounded 44% → 45%).
  const drifted = "Net worth is €207.488 and concentration falls to 45%.";
  check("a number outside the allowed set → invalid", validateNarration(drifted, allowed) === false);
}
{
  // Invented currency amount not in the set.
  const invented = "This adds €1.000.000 to your position.";
  check("invented amount → invalid", validateNarration(invented, allowed) === false);
}

console.log("Guardrail — no numbers passes:");
{
  check("prose with no figures → valid", validateNarration("Your concentration eases meaningfully.", allowed) === true);
}

console.log(failures === 0 ? "\nAll guardrail checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
