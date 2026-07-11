// Reusable numeric-integrity guardrail. Any number a model emits in prose must be
// one of the deterministically-computed figures it was given (pre-formatted). Used
// by the scenario narration and by the portfolio insight band.

// Currency symbol or trailing % is kept; trailing separators/space are dropped.
const NUM_TOKEN = /[€$£]?\s?\d[\d.,]*%?/g;
const normFigure = (t: string): string => t.replace(/[.,\s]+$/, "").replace(/\s+/g, "");

// Canonical numeric form — the SAME number in any separator convention maps to
// one string. formatMoney emits Dutch-style grouping for every display currency
// ("€399.852", "$26.971"), but a model narrating in English legitimately writes
// the identical amount as "€399,852" — and treating that spelling as fabrication
// erased entire replies (every money-quoting turn died to "Here's what I
// found."). A "." or "," followed by exactly 3 digits is grouping and is
// dropped; a shorter final group is a decimal part, normalised to ".".
// "€399.852" ≡ "€399,852" ≡ "€399852" → "€399852"; "62,5%" ≡ "62.5%" → "62.5%".
// Different NUMBERS still differ ("€39.985", "€1.50" vs "€150"), so real
// fabrication is caught exactly as before.
function canonical(t: string): string {
  const norm = normFigure(t);
  const sym = /^[€$£]/.exec(norm)?.[0] ?? "";
  const pctMark = norm.endsWith("%") ? "%" : "";
  let body = norm.slice(sym.length, pctMark ? -1 : undefined);
  let dec = "";
  const dm = /^(.*)[.,](\d{1,2})$/.exec(body);
  if (dm) {
    body = dm[1];
    dec = dm[2];
  }
  body = body.replace(/[.,]/g, "");
  return `${sym}${body}${dec ? `.${dec}` : ""}${pctMark}`;
}

/** Every numeric token in `text`, normalised (currency/percent kept, separators trimmed). */
export function extractNumbers(text: string): string[] {
  return (text.match(NUM_TOKEN) ?? []).map(normFigure).filter(Boolean);
}

/** True iff every number in `text` appears in the allowed pre-formatted figure set. */
export function validateNarration(text: string, allowedFigures: string[]): boolean {
  const allowed = new Set(allowedFigures.map(canonical));
  return extractNumbers(text).every((t) => allowed.has(canonical(t)));
}

// Money- or percent-tagged tokens only — the figures whose fabrication actually
// misleads a reader ("€26.971", "5,2%"). Bare integers are excluded: position
// counts ("18 positions"), totals ("80 total"), years and ordinals ("2 years
// ago") are legitimate prose the model writes and were never "figures", so
// validating them tripped the guard on ordinary conversational turns.
const MONEY_PCT_TOKEN = /[€$£]\s?\d[\d.,]*%?|\d[\d.,]*\s?%/g;

/** Every money/percent token in `text`, normalised the same way as {@link extractNumbers}. */
export function extractMonetaryNumbers(text: string): string[] {
  return (text.match(MONEY_PCT_TOKEN) ?? []).map(normFigure).filter(Boolean);
}

/** True iff every money/percent figure in `text` appears in the allowed set
 *  (canonical comparison — separator convention doesn't matter, digits do). */
export function validateMonetaryNarration(text: string, allowedFigures: string[]): boolean {
  const allowed = new Set(allowedFigures.map(canonical));
  return extractMonetaryNumbers(text).every((t) => allowed.has(canonical(t)));
}

// Zero-cost tolerance for percent figures. The tools hand the model one-decimal
// dot percents ("62.5%"); the two rewrites a model legitimately makes when
// narrating — the correctly ROUNDED integer ("63%") and the comma-decimal twin
// ("62,5%", the European style the rest of the reply is written in) — used to
// count as fabrication and nuke the whole reply to a bare "Here's what I
// found.". Same number, different spelling — admit both. Money amounts get NO
// variants: a reformatted or rounded amount is a different figure and stays a
// violation.
export function withPercentTolerance(figures: string[]): string[] {
  const out = new Set(figures);
  for (const f of figures) {
    const m = /^(\d+)\.(\d+)%$/.exec(f);
    if (!m) continue;
    out.add(`${m[1]},${m[2]}%`);
    out.add(`${Math.round(Number(`${m[1]}.${m[2]}`))}%`);
  }
  return [...out];
}

/** The money/percent tokens in `text` that are NOT in the allowed set — the
 *  exact violations (empty = narration passes), so a guardrail trip can be
 *  logged with WHAT tripped it instead of a bare warning. */
export function offendingMonetaryTokens(text: string, allowedFigures: string[]): string[] {
  const allowed = new Set(allowedFigures.map(canonical));
  return extractMonetaryNumbers(text).filter((t) => !allowed.has(canonical(t)));
}
