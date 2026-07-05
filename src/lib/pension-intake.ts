// Deterministic pension intake: the validation gate, the confirmation-echo
// builder, and the canonical chip sets for the chips-first intake flow.
//
// Pension is ONE asset class (type='pension') with two economic shapes:
//   - CAPITAL (pension_kind 'dc', or null legacy): an owned pot. Uses `value`
//     (pot) + `mortgage_rate` (reused as the annual growth assumption) +
//     `monthly_contribution` + `access_age`. Counts toward net worth.
//   - INCOME (pension_kind 'db' | 'state'): a future entitlement, no owned
//     balance. Uses `annual_income` + `access_age` (start age). `value` is null.
//     Off-balance everywhere.
//
// The LLM conducts the intake language; THIS module is the deterministic gate
// that guarantees an incomplete pension can never commit — it is enforced in
// both the proposal/echo step and the write path.

import { currencySymbol } from "./utils";

// ── Chip sets (single source of truth for prompt + allowlist + echo) ────────────

export const PENSION_TYPE_CHIPS = [
  "Workplace / private pot (DC)",
  "Company defined-benefit (DB)",
  "State pension",
  "Not sure",
] as const;

export const PENSION_GROWTH_CHIPS = ["3%", "4%", "5%", "Type it"] as const;

export const PENSION_AGE_CHIPS = ["65", "67", "68", "Other"] as const;

// Income pensions: start age is optional — "Skip" means omit access_age
// entirely and let the server apply DEFAULT_PENSION_ACCESS_AGE.
export const PENSION_INCOME_AGE_CHIPS = ["65", "67", "68", "Skip"] as const;

// Confirmation-echo chips. "Looks right, add it" is a commit chip (mirror it in
// CONFIRMATION_CHIPS so the commit turn skips the proposal step).
export const PENSION_ECHO_CHIPS = ["Looks right, add it", "Change something"] as const;

// Every chip the pension intake can emit — mirrored into ALLOWED_CHIPS so the
// server's chip sanitizer never silently drops an intake chip.
export const ALL_PENSION_CHIPS: readonly string[] = [
  ...PENSION_TYPE_CHIPS,
  ...PENSION_GROWTH_CHIPS,
  ...PENSION_AGE_CHIPS,
  ...PENSION_INCOME_AGE_CHIPS,
  ...PENSION_ECHO_CHIPS,
];

// ── Shape + types ──────────────────────────────────────────────────────────────

export type PensionKind = "dc" | "db" | "state";

// The structural slice of a portfolio change / asset row the gate needs. Kept
// loose so both the propose/commit changes and existing asset rows fit it.
export interface PensionChangeInput {
  type?: string | null;
  pension_kind?: PensionKind | null;
  value?: number | null;
  currency?: string | null;
  annual_income?: number | null;
  monthly_contribution?: number | null;
  mortgage_rate?: number | null; // reused as the growth assumption (%)
  access_age?: number | null;
  pension_provider?: string | null;
}

export type PensionGateResult = { ok: true } | { ok: false; question: string };

export function pensionShapeOfKind(kind: PensionKind | null | undefined): "capital" | "income" {
  return kind === "db" || kind === "state" ? "income" : "capital";
}

export function kindLabel(kind: PensionKind): string {
  return kind === "dc"
    ? "Workplace / private pot (DC)"
    : kind === "db"
      ? "Company defined-benefit (DB)"
      : "State pension";
}

const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

// A value that was EXPLICITLY provided (any finite number, including 0 or a
// negative). Used for the growth assumption, where 0% (or a negative real-terms
// figure) is a legitimate answer — only a missing/NaN value should re-ask.
const isProvidedNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

// ── The gate ────────────────────────────────────────────────────────────────────
// Returns { ok: true } only when EVERY required field for the shape is present
// and valid. Otherwise returns the single next question to ask. No defaults —
// growth and access age must be explicitly provided. This is the deterministic
// guarantee behind "an incomplete pension can never be saved".
export function validatePensionChange(c: PensionChangeInput): PensionGateResult {
  const kind = c.pension_kind;
  if (kind !== "dc" && kind !== "db" && kind !== "state") {
    return {
      ok: false,
      question:
        "What kind of pension is this — a workplace or private pot (DC), a company defined-benefit (DB) scheme, or the State pension?",
    };
  }

  if (pensionShapeOfKind(kind) === "capital") {
    if (!isPositiveNumber(c.value)) {
      return { ok: false, question: "What's the current value of the pot?" };
    }
    if (!isProvidedNumber(c.mortgage_rate)) {
      return { ok: false, question: "What annual growth assumption should I use? (0% is fine.)" };
    }
    if (!isPositiveInt(c.access_age)) {
      return { ok: false, question: "At what age can you access it?" };
    }
    return { ok: true };
  }

  // Income shape (db | state)
  if (!isPositiveNumber(c.annual_income)) {
    return { ok: false, question: "What annual income will it pay?" };
  }
  return { ok: true };
}

// Default start age for income pensions when the user doesn't give one —
// "optional start age" per the no-cost-questions intake; standard NL state
// pension age is a reasonable stand-in.
export const DEFAULT_PENSION_ACCESS_AGE = 67;

// ── Confirmation echo ────────────────────────────────────────────────────────────
// Enumerates EVERY captured field for the shape, for the user to confirm before
// commit. Assumes the gate has already passed.
export function buildPensionEcho(c: PensionChangeInput, name: string): string {
  const kind = (c.pension_kind ?? "dc") as PensionKind;
  const shape = pensionShapeOfKind(kind);
  const cur = c.currency || "EUR";
  const sym = currencySymbol(cur);
  const money = (n: number) => `${sym}${Math.round(n).toLocaleString()}`;

  const lines: string[] = [`Type: ${kindLabel(kind)}`, `Name: ${name}`];

  if (shape === "capital") {
    lines.push(`Current value: ${money(c.value as number)}`);
    if ((c.pension_provider ?? "").trim()) lines.push(`Provider: ${(c.pension_provider as string).trim()}`);
    if (typeof c.monthly_contribution === "number" && c.monthly_contribution > 0) {
      lines.push(`Monthly contribution: ${money(c.monthly_contribution)}`);
    }
    lines.push(`Growth assumption: ${c.mortgage_rate}%`);
    lines.push(`Access age: ${c.access_age}`);
  } else {
    lines.push(`Annual income: ${money(c.annual_income as number)} / year`);
    if ((c.pension_provider ?? "").trim()) lines.push(`Provider/scheme: ${(c.pension_provider as string).trim()}`);
    lines.push(`Start age: ${c.access_age ?? DEFAULT_PENSION_ACCESS_AGE}`);
  }

  return lines.join("\n");
}

// True when a proposed/committed change concerns a pension.
export function isPensionChange(c: { type?: string | null }): boolean {
  return c.type === "pension";
}
