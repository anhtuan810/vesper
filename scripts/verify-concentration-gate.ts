// Unit test for the Concentration vital's surfacing gate (pure, no I/O).
// Run:  npx tsx scripts/verify-concentration-gate.ts
//
// Locks the confirmed mismatch: applies() counted income (db/state) pension
// entitlements toward its "2 or more assets" gate, but compute() excludes them —
// so a user with ONE real position plus a pension entitlement saw the card
// surface and report "100% · needs attention". The gate must measure the same
// set compute() does.

import { applies } from "../src/lib/vitals/concentration";
import type { Asset } from "../src/lib/supabase";
import type { VitalUser } from "../src/lib/vitals/types";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

const user = {} as VitalUser;
const asset = (o: Partial<Asset>): Asset => ({ id: "x", name: "X", type: "stocks", value: 1000, currency: "EUR", ...o } as Asset);
const etf = asset({ name: "World ETF", type: "etf", value: 50_000 });
const stock = asset({ name: "MSFT", type: "stocks", value: 30_000 });
const dcPension = asset({ name: "Workplace DC", type: "pension", value: 120_000, pension_kind: "dc" });
const dbPension = asset({ name: "Final-salary", type: "pension", value: 0, pension_kind: "db" });
const statePension = asset({ name: "State pension", type: "pension", value: 0, pension_kind: "state" });

check("1 real position + income (db) pension → card does NOT surface", applies(user, [etf, dbPension]) === false);
check("1 real position + state pension → card does NOT surface", applies(user, [etf, statePension]) === false);
check("2 real positions → surfaces", applies(user, [etf, stock]) === true);
check("1 real position + a CAPITAL (dc) pension → surfaces (both are owned)", applies(user, [etf, dcPension]) === true);
check("a lone position → does not surface", applies(user, [etf]) === false);
check("only an income pension → does not surface", applies(user, [dbPension]) === false);

console.log(failures === 0 ? "\nAll concentration-gate checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
