// Unit tests for chat chip sanitisation + confirmation-chip membership (pure).
// Run:  npx tsx scripts/verify-chip-sanitizer.ts
//
// Guards two failure modes:
//  1. A model-emitted chip that isn't on the allowlist must be dropped (never
//     rendered as a blank/garbled tap target).
//  2. Every chip that commits-on-tap (CONFIRMATION_CHIPS — taps that skip the
//     proposal step and apply directly) must also be a known allowlisted chip,
//     and the address-confirm chip must be present so the property-add flow
//     can't loop on a re-emitted address proposal.

import { sanitizeChips, ALLOWED_CHIPS, CONFIRMATION_CHIPS } from "../src/lib/chat-helpers";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("sanitizeChips keeps valid allowlisted chips:");
{
  const out = sanitizeChips(["Confirm and save", "No, let me correct it"]);
  check("valid pair preserved", JSON.stringify(out) === JSON.stringify(["Confirm and save", "No, let me correct it"]), JSON.stringify(out));
  const three = sanitizeChips(["EUR", "USD", "GBP"]);
  check("valid triple preserved", JSON.stringify(three) === JSON.stringify(["EUR", "USD", "GBP"]), JSON.stringify(three));
}

console.log("sanitizeChips drops unknown / unsafe / wrong-count input:");
{
  check("unknown chip leaving <2 → null", sanitizeChips(["Confirm and save", "Totally made up chip"]) === null);
  check("single allowlisted chip → null (needs 2+)", sanitizeChips(["Confirm and save"]) === null);
  check("six chips → null (max 5)", sanitizeChips(["EUR", "USD", "GBP", "Today", "Yesterday", "Skip — track from today"]) === null);
  check("non-array → null", sanitizeChips("nope") === null);
  check("non-string entries filtered then count-checked", sanitizeChips([1, 2, "Confirm and save"] as unknown) === null);
}

console.log("Confirmation chips (commit-on-tap) are correct:");
{
  check('"Yes, that\'s the address" is a confirmation chip (closes the property-add loop)', CONFIRMATION_CHIPS.has("Yes, that's the address"));
  check('"Confirm and save" is a confirmation chip', CONFIRMATION_CHIPS.has("Confirm and save"));
  check('"Looks right, add it" is a confirmation chip', CONFIRMATION_CHIPS.has("Looks right, add it"));
  // Negative / correction chips must NOT short-circuit to commit.
  check('"No, let me correct it" is NOT a confirmation chip', !CONFIRMATION_CHIPS.has("No, let me correct it"));
  check('"No, leave as is" is NOT a confirmation chip', !CONFIRMATION_CHIPS.has("No, leave as is"));
}

console.log("Every confirmation chip is on the chip allowlist:");
{
  for (const c of CONFIRMATION_CHIPS) {
    check(`"${c}" ∈ ALLOWED_CHIPS`, ALLOWED_CHIPS.has(c));
  }
}

console.log(failures === 0 ? "\nAll chip-sanitizer checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
