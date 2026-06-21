// Unit tests for deterministic acquisition-date parsing (pure, no I/O).
// Run:  npx tsx scripts/verify-acquisition-date.ts
//
// Guards the reported chat bug: a date the user states inline ("from jan 2024")
// MUST resolve to a stored month so the chat commits the add instead of asking
// "When did you start holding this?" again. Also guards the future-date rule —
// a future month must never resolve (no held-since-the-future positions, and no
// fabricated "historical" price from the nearest available close).

import { parseAcquisitionMonth, isTrackFromNow } from "../src/lib/acquisition-date";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

console.log("A stated date resolves to a stored month (the reported bug):");
{
  check('"jan 2024" → 2024-01-01', parseAcquisitionMonth("jan 2024") === "2024-01-01", String(parseAcquisitionMonth("jan 2024")));
  check('"from jan 2024" → 2024-01-01', parseAcquisitionMonth("from jan 2024") === "2024-01-01", String(parseAcquisitionMonth("from jan 2024")));
  check('"January 2024" → 2024-01-01', parseAcquisitionMonth("January 2024") === "2024-01-01");
  check('"around March 2021" → 2021-03-01', parseAcquisitionMonth("around March 2021") === "2021-03-01");
  check('"in March 2021" → 2021-03-01', parseAcquisitionMonth("in March 2021") === "2021-03-01");
  check('"early 2015" → 2015-01-01', parseAcquisitionMonth("early 2015") === "2015-01-01");
  check('"late 2015" → 2015-10-01', parseAcquisitionMonth("late 2015") === "2015-10-01");
  check('"2019" → 2019-01-01', parseAcquisitionMonth("2019") === "2019-01-01");
  check('ISO "2021-03-15" preserved to the day', parseAcquisitionMonth("2021-03-15") === "2021-03-15");
  check('ISO month "2021-03" → 2021-03-01', parseAcquisitionMonth("2021-03") === "2021-03-01");
}

console.log("Track-from-now / no-date → null (omit the acquisition date):");
{
  check('"just track from now" → null', parseAcquisitionMonth("just track from now") === null);
  check('"track from today" → null', parseAcquisitionMonth("track from today") === null);
  check('"skip" → null', parseAcquisitionMonth("skip") === null);
  check("isTrackFromNow agrees", isTrackFromNow("just track from now") === true && isTrackFromNow("jan 2024") === false);
}

console.log("Non-dates → undefined (caller asks; never a fabricated date):");
{
  // "at market price" must NOT be read as a date — it is the exact extra clause
  // from the reported message and is not a temporal token.
  check('"at market price" → undefined', parseAcquisitionMonth("at market price") === undefined, String(parseAcquisitionMonth("at market price")));
  check('empty string → undefined', parseAcquisitionMonth("") === undefined);
  check("null → undefined", parseAcquisitionMonth(null) === undefined);
}

console.log("Future months never resolve (no held-since-the-future positions):");
{
  const futureYear = new Date().getFullYear() + 2;
  check(`"jan ${futureYear}" → undefined`, parseAcquisitionMonth(`jan ${futureYear}`) === undefined, String(parseAcquisitionMonth(`jan ${futureYear}`)));
  check(`bare "${futureYear}" → undefined`, parseAcquisitionMonth(String(futureYear)) === undefined);
  check(`ISO "${futureYear}-01-15" → undefined`, parseAcquisitionMonth(`${futureYear}-01-15`) === undefined);
  // The current month is allowed (it is not in the future).
  const nowMonth = new Date().toISOString().slice(0, 7);
  check(`current month "${nowMonth}-15" allowed`, parseAcquisitionMonth(`${nowMonth}-15`) === `${nowMonth}-15`, String(parseAcquisitionMonth(`${nowMonth}-15`)));
}

console.log(failures === 0 ? "\nAll acquisition-date checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
