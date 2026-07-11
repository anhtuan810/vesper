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

console.log("Day-bearing dates keep their month (was collapsing to Jan-1):");
{
  // US "Month Day, Year" and EU "Day Month Year" — the day between the month
  // name and the year previously defeated the month-year regex, so the whole
  // date fell through to the bare-year branch and lost the month.
  check('"March 5, 2021" → 2021-03-01', parseAcquisitionMonth("March 5, 2021") === "2021-03-01", String(parseAcquisitionMonth("March 5, 2021")));
  check('"March 5 2021" → 2021-03-01', parseAcquisitionMonth("March 5 2021") === "2021-03-01", String(parseAcquisitionMonth("March 5 2021")));
  check('"Dec 5, 2021" → 2021-12-01 (not 2021-01)', parseAcquisitionMonth("Dec 5, 2021") === "2021-12-01", String(parseAcquisitionMonth("Dec 5, 2021")));
  check('"December 31, 2021" → 2021-12-01', parseAcquisitionMonth("December 31, 2021") === "2021-12-01", String(parseAcquisitionMonth("December 31, 2021")));
  check('"5 March 2021" → 2021-03-01', parseAcquisitionMonth("5 March 2021") === "2021-03-01", String(parseAcquisitionMonth("5 March 2021")));
  check('"5th of March, 2021" → 2021-03-01', parseAcquisitionMonth("5th of March, 2021") === "2021-03-01", String(parseAcquisitionMonth("5th of March, 2021")));
  check('"bought 15 Aug 2014" → 2014-08-01', parseAcquisitionMonth("bought 15 Aug 2014") === "2014-08-01", String(parseAcquisitionMonth("bought 15 Aug 2014")));
}

console.log("Relative phrases resolve (the reported \"6 months ago\" bug):");
{
  // Month arithmetic is anchored to today, so compute the expected month the
  // same way the parser does rather than hard-coding a date (keeps the test
  // stable as the clock moves).
  const now = new Date();
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth(); // 0-based
  const monthsAgo = (n: number) => {
    const total = nowY * 12 + nowM - n;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12;
    return `${y}-${String(m + 1).padStart(2, "0")}-01`;
  };
  const daysAgo = (n: number) => {
    const d = new Date(Date.UTC(nowY, nowM, now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };
  check(`"6 months ago" → ${monthsAgo(6)}`, parseAcquisitionMonth("6 months ago") === monthsAgo(6), String(parseAcquisitionMonth("6 months ago")));
  check(`"about 6 months ago" → ${monthsAgo(6)}`, parseAcquisitionMonth("about 6 months ago") === monthsAgo(6), String(parseAcquisitionMonth("about 6 months ago")));
  check(`"4 months ago" → ${monthsAgo(4)}`, parseAcquisitionMonth("4 months ago") === monthsAgo(4), String(parseAcquisitionMonth("4 months ago")));
  check(`"a month ago" → ${monthsAgo(1)}`, parseAcquisitionMonth("a month ago") === monthsAgo(1), String(parseAcquisitionMonth("a month ago")));
  check(`"a year ago" → ${monthsAgo(12)}`, parseAcquisitionMonth("a year ago") === monthsAgo(12), String(parseAcquisitionMonth("a year ago")));
  check(`"2 years ago" → ${monthsAgo(24)}`, parseAcquisitionMonth("2 years ago") === monthsAgo(24), String(parseAcquisitionMonth("2 years ago")));
  check(`"a couple of months ago" → ${monthsAgo(2)}`, parseAcquisitionMonth("a couple of months ago") === monthsAgo(2), String(parseAcquisitionMonth("a couple of months ago")));
  check(`"a few months ago" → ${monthsAgo(3)}`, parseAcquisitionMonth("a few months ago") === monthsAgo(3), String(parseAcquisitionMonth("a few months ago")));
  check(`"last month" → ${monthsAgo(1)}`, parseAcquisitionMonth("last month") === monthsAgo(1), String(parseAcquisitionMonth("last month")));
  check(`"last year" → ${monthsAgo(12)}`, parseAcquisitionMonth("last year") === monthsAgo(12), String(parseAcquisitionMonth("last year")));
  check(`"3 weeks ago" → ${daysAgo(21)}`, parseAcquisitionMonth("3 weeks ago") === daysAgo(21), String(parseAcquisitionMonth("3 weeks ago")));
  check(`"yesterday" → ${daysAgo(1)}`, parseAcquisitionMonth("yesterday") === daysAgo(1), String(parseAcquisitionMonth("yesterday")));
  // A relative phrase is always in the past — never a future date, never undefined.
  check('"in 6 months" (future) does NOT resolve', parseAcquisitionMonth("in 6 months") === undefined, String(parseAcquisitionMonth("in 6 months")));
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
