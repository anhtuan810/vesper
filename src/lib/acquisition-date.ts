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
  mid: 6,
  middle: 6,
  summer: 7,
  late: 10,
  end: 12,
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

  // "early 2015" / "late 2015" / "mid-2015"
  const partYear = lower.match(/\b(early|beginning|start|mid|middle|summer|late|end)(?:\s+of)?[\s-]+(\d{4})\b/);
  if (partYear) {
    const month = PART_OF_YEAR[partYear[1]];
    const year = Number(partYear[2]);
    if (month) return notFuture(`${year}-${pad2(month)}-01`);
  }

  // Bare year — "2015", "around 2015"
  const bareYear = lower.match(/\b(19|20)\d{2}\b/);
  if (bareYear) {
    return notFuture(`${bareYear[0]}-01-01`);
  }

  return undefined;
}

export function isTrackFromNow(raw: string | null | undefined): boolean {
  return raw != null && TRACK_FROM_NOW.test(raw.trim());
}
