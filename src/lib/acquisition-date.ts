// Deterministic parsing of the acquisition date a user states in chat.
//
// The model only ever extracts the phrase the user said ("around March 2021",
// "early 2015", "track from now") — it never resolves it to a stored date.
// This module is the sole place that turns such a phrase into a stored
// month-precision ISO date (YYYY-MM-01), or into "no date" (track from now).
//
// Stored at month precision because that's the resolution the user actually
// gave us — stamping a fabricated day-of-month would imply false precision.

const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// "early 2015" / "mid 2015" / "late 2015" — a rough part-of-year, mapped to a
// representative month. Still month precision; no day fabricated.
const PART_OF_YEAR: Record<string, number> = {
  early: 1,
  beginning: 1,
  start: 1,
  spring: 3,
  mid: 6,
  middle: 6,
  summer: 7,
  fall: 10,
  autumn: 10,
  late: 10,
  end: 12,
  winter: 12,
};

const TRACK_FROM_NOW = /\b(track(ing)?\s+from\s+(now|today)|just\s+track\s+from\s+now|no\s+date|skip)\b/i;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Parses a user-stated acquisition date phrase into a month-precision ISO date
 * (YYYY-MM-01), or null when the user opted to track from now (or said nothing
 * usable). Returns `undefined` when the phrase isn't recognized at all — the
 * caller should then fall back to asking, rather than silently storing null.
 */
export function parseAcquisitionMonth(raw: string | null | undefined): string | null | undefined {
  if (raw == null) return undefined;
  const text = raw.trim();
  if (!text) return undefined;
  if (TRACK_FROM_NOW.test(text)) return null;

  const lower = text.toLowerCase();

  // An acquisition can never be in the future. A future month (a typo, or a
  // model slip) is treated as "not a usable date" so the caller falls back to
  // tracking from now rather than fabricating a held-since-the-future position
  // (which would also make the historical price lookup return today's close).
  const todayMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
  const notFuture = (iso: string): string | undefined =>
    iso.slice(0, 7) <= todayMonth ? iso : undefined;

  // Exact ISO date — the user (or an upstream flow) gave a specific day;
  // preserve it rather than rounding away precision they actually stated.
  const isoDay = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDay) {
    const month = Number(isoDay[2]);
    if (month >= 1 && month <= 12) return notFuture(`${isoDay[1]}-${pad2(month)}-${isoDay[3]}`);
  }
  // ISO month only ("2021-03")
  const isoMonth = lower.match(/^(\d{4})-(\d{2})$/);
  if (isoMonth) {
    const month = Number(isoMonth[2]);
    if (month >= 1 && month <= 12) return notFuture(`${isoMonth[1]}-${pad2(month)}-01`);
  }

  // "March 2021" / "around March 2021" / "in March 2021"
  const monthYear = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{4})\b/
  );
  if (monthYear) {
    const month = MONTHS[monthYear[1]];
    const year = Number(monthYear[2]);
    if (month) return notFuture(`${year}-${pad2(month)}-01`);
  }

  // A day-bearing date, US ("March 5, 2021" / "Mar 5 2021") or EU ("5 March 2021"
  // / "5th of March, 2021"). The month-year regex above requires the year to
  // follow the month name immediately, so a day in between made these fall
  // through to the bare-year branch and silently collapse to Jan-1 of that year
  // (losing the month by up to 11 months). Resolved to month precision (this
  // module's contract), same as the "March 2021" case.
  const monthDayYear = lower.match(
    /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(\d{4})\b/
  );
  if (monthDayYear) {
    const month = MONTHS[monthDayYear[1]];
    const year = Number(monthDayYear[2]);
    if (month) return notFuture(`${year}-${pad2(month)}-01`);
  }
  const dayMonthYear = lower.match(
    /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?,?\s+(\d{4})\b/
  );
  if (dayMonthYear) {
    const month = MONTHS[dayMonthYear[1]];
    const year = Number(dayMonthYear[2]);
    if (month) return notFuture(`${year}-${pad2(month)}-01`);
  }

  // "early 2015" / "late 2015" / "mid-2015" / "spring 2015" / "autumn 2015"
  const partYear = lower.match(/\b(early|beginning|start|spring|mid|middle|summer|fall|autumn|late|end|winter)(?:\s+of)?[\s-]+(\d{4})\b/);
  if (partYear) {
    const month = PART_OF_YEAR[partYear[1]];
    const year = Number(partYear[2]);
    if (month) return notFuture(`${year}-${pad2(month)}-01`);
  }

  // "Q3 2021" / "Q1-2020" — a fiscal-style quarter, mapped to its first month.
  const quarter = lower.match(/\bq([1-4])[\s-]+(\d{4})\b/);
  if (quarter) {
    const qMonth = (Number(quarter[1]) - 1) * 3 + 1; // Q1→1, Q2→4, Q3→7, Q4→10
    return notFuture(`${quarter[2]}-${pad2(qMonth)}-01`);
  }

  // Bare year — "2015", "around 2015"
  const bareYear = lower.match(/\b(19|20)\d{2}\b/);
  if (bareYear) {
    return notFuture(`${bareYear[0]}-01-01`);
  }

  // Relative phrases — "6 months ago", "about 4 months ago", "a year ago",
  // "last month", "3 weeks ago", "yesterday", "last March". The model passes the
  // user's words through VERBATIM (the agent prompt/tools say: pass every date
  // phrase through verbatim; deterministic code resolves it), so turning these
  // into a stored date is THIS module's job. Without it, a natural answer like "about
  // 6 months ago" resolved to undefined and the acquisition date was silently
  // dropped — leaving the position tracked from today: no net-worth history
  // backfill, no journal entry at the purchase date, no market-event context.
  // Months/years keep month precision (YYYY-MM-01, this module's contract);
  // weeks/days are day-specific, so the resolved day is kept.
  const now = new Date();
  const nowY = now.getUTCFullYear();
  const nowM = now.getUTCMonth(); // 0-based

  // Shift `n` whole months back from this month → YYYY-MM-01. Pure year-month
  // arithmetic, so no Date rollover surprises around month ends (Jan 31 − 1mo).
  const monthsAgo = (n: number): string => {
    const total = nowY * 12 + nowM - n;
    const y = Math.floor(total / 12);
    const m = ((total % 12) + 12) % 12; // 0-based, always non-negative
    return `${y}-${pad2(m + 1)}-01`;
  };
  // Shift `n` days back from today → exact YYYY-MM-DD.
  const daysAgo = (n: number): string => {
    const d = new Date(Date.UTC(nowY, nowM, now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().slice(0, 10);
  };

  if (/\byesterday\b/.test(lower)) return notFuture(daysAgo(1));
  if (/\blast\s+week\b/.test(lower)) return notFuture(daysAgo(7));
  if (/\blast\s+month\b/.test(lower)) return notFuture(monthsAgo(1));
  if (/\blast\s+year\b/.test(lower)) return notFuture(monthsAgo(12));

  // "last March" — the most recent past occurrence of a named month.
  const lastNamed = lower.match(
    /\blast\s+(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
  );
  if (lastNamed) {
    const tm = MONTHS[lastNamed[1]] - 1; // 0-based target month
    const year = tm < nowM ? nowY : nowY - 1; // this year if already past, else last
    return notFuture(`${year}-${pad2(tm + 1)}-01`);
  }

  // "<n> <unit> ago" — n is a digit or a word quantifier ("a", "two", "couple",
  // "several"); unit is day/week/month/year, including the yr/mo/wk abbreviations,
  // and accepts "…back"/"…earlier" as well as "…ago". Spelled-out numerals and
  // abbreviations are included because a natural answer like "two years ago" or
  // "6 mo ago" otherwise fell through to undefined and the date was silently
  // dropped (position left tracked from today) — the exact reported class of bug.
  const WORD_QTY: Record<string, number> = {
    a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
    eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    couple: 2, few: 3, several: 4,
  };
  const rel = lower.match(
    /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few|several)\s+(?:of\s+)?(day|week|wk|month|mo|year|yr)s?\s+(?:ago|back|earlier)\b/
  );
  if (rel) {
    const n = /^\d+$/.test(rel[1]) ? parseInt(rel[1], 10) : WORD_QTY[rel[1]];
    if (n && n > 0) {
      switch (rel[2]) {
        case "day": return notFuture(daysAgo(n));
        case "week": case "wk": return notFuture(daysAgo(n * 7));
        case "month": case "mo": return notFuture(monthsAgo(n));
        case "year": case "yr": return notFuture(monthsAgo(n * 12));
      }
    }
  }

  return undefined;
}

export function isTrackFromNow(raw: string | null | undefined): boolean {
  return raw != null && TRACK_FROM_NOW.test(raw.trim());
}

// Beyond this age a stated purchase date is almost certainly a data-entry
// mistake (a mistyped year like 1014, a wrong century) rather than a real
// long-held asset, so the add flow asks the user to confirm it. Deliberately
// generous — a genuine decades-old inheritance (say 1975) still saves without a
// prompt; only clearly-wrong dates are questioned. The graph itself never
// reconstructs further than MAX_HISTORY_YEARS regardless (networth-estimate.ts).
export const MAX_PLAUSIBLE_AGE_YEARS = 100;

export type DateImplausibility = "future" | "too_old";

/**
 * Judges an ALREADY-RESOLVED acquisition date (YYYY-MM-DD or YYYY-MM) for
 * data-entry plausibility — the complement to parseAcquisitionMonth, which turns
 * a phrase into a date. Returns { ok: false, reason } for a date the add flow
 * should ask the user to confirm before saving: one in the future, or older than
 * MAX_PLAUSIBLE_AGE_YEARS. Unparseable input is treated as ok (not this
 * function's job to reject — parseAcquisitionMonth already gates recognition).
 */
export function checkAcquisitionDate(
  date: string | null | undefined,
  todayStr: string = new Date().toISOString().slice(0, 10),
): { ok: boolean; reason?: DateImplausibility } {
  if (!date) return { ok: true };
  const iso = date.length === 7 ? `${date}-01` : date;
  const t = Date.parse(iso.length > 10 ? iso : `${iso}T12:00:00Z`);
  if (!Number.isFinite(t)) return { ok: true };
  const today = Date.parse(`${todayStr}T12:00:00Z`);
  if (t > today) return { ok: false, reason: "future" };
  const floor = new Date(`${todayStr}T12:00:00Z`);
  floor.setUTCFullYear(floor.getUTCFullYear() - MAX_PLAUSIBLE_AGE_YEARS);
  if (t < floor.getTime()) return { ok: false, reason: "too_old" };
  return { ok: true };
}
