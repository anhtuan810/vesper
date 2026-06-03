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
