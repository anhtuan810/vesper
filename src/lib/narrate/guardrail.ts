// Reusable numeric-integrity guardrail. Any number a model emits in prose must be
// one of the deterministically-computed figures it was given (pre-formatted). Used
// by the scenario narration and by the portfolio insight band.

// Currency symbol or trailing % is kept; trailing separators/space are dropped.
const NUM_TOKEN = /[€$£]?\s?\d[\d.,]*%?/g;
const normFigure = (t: string): string => t.replace(/[.,\s]+$/, "").replace(/\s+/g, "");

/** Every numeric token in `text`, normalised (currency/percent kept, separators trimmed). */
export function extractNumbers(text: string): string[] {
  return (text.match(NUM_TOKEN) ?? []).map(normFigure).filter(Boolean);
}

/** True iff every number in `text` appears in the allowed pre-formatted figure set. */
export function validateNarration(text: string, allowedFigures: string[]): boolean {
  const allowed = new Set(allowedFigures.map(normFigure));
  return extractNumbers(text).every((t) => allowed.has(t));
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

/** True iff every money/percent figure in `text` appears in the allowed set. */
export function validateMonetaryNarration(text: string, allowedFigures: string[]): boolean {
  const allowed = new Set(allowedFigures.map(normFigure));
  return extractMonetaryNumbers(text).every((t) => allowed.has(t));
}
