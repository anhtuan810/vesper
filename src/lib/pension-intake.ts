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

export const PENSION_PROVIDER_CHIPS = [
  "ABN AMRO",
  "ASR",
  "Nationale-Nederlanden",
  "Aegon",
  "Other — type it",
] as const;

export const PENSION_CONTRIB_CHIPS = [
  "Not contributing (€0)",
  "€250",
  "€500",
  "Other — type it",
] as const;

export const PENSION_GROWTH_CHIPS = ["3%", "4%", "5%", "Type it"] as const;

export const PENSION_AGE_CHIPS = ["65", "67", "68", "Other"] as const;

// Confirmation-echo chips. "Looks right, add it" is a commit chip (mirror it in
// CONFIRMATION_CHIPS so the commit turn skips the proposal step).
export const PENSION_ECHO_CHIPS = ["Looks right, add it", "Change something"] as const;

// Every chip the pension intake can emit — mirrored into ALLOWED_CHIPS so the
// server's chip sanitizer never silently drops an intake chip.
export const ALL_PENSION_CHIPS: readonly string[] = [
  ...PENSION_TYPE_CHIPS,
  ...PENSION_PROVIDER_CHIPS,
  ...PENSION_CONTRIB_CHIPS,
  ...PENSION_GROWTH_CHIPS,
  ...PENSION_AGE_CHIPS,
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

const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

const hasProvider = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;

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
    if (!hasProvider(c.pension_provider)) {
      return { ok: false, question: "Who is the provider?" };
    }
    if (!isNonNegativeNumber(c.monthly_contribution)) {
      return {
        ok: false,
        question: "How much do you contribute each month? (€0 is fine if you're not contributing.)",
      };
    }
    if (!isPositiveNumber(c.mortgage_rate)) {
      return { ok: false, question: "What annual growth assumption should I use?" };
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
  if (!hasProvider(c.pension_provider)) {
    return { ok: false, question: "Which provider or scheme is this?" };
  }
  if (!isPositiveInt(c.access_age)) {
    return { ok: false, question: "At what age does it start paying?" };
  }
  return { ok: true };
}

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
    lines.push(`Provider: ${(c.pension_provider ?? "").trim()}`);
    lines.push(
      `Monthly contribution: ${
        (c.monthly_contribution as number) > 0 ? money(c.monthly_contribution as number) : "none (€0)"
      }`,
    );
    lines.push(`Growth assumption: ${c.mortgage_rate}%`);
    lines.push(`Access age: ${c.access_age}`);
  } else {
    lines.push(`Annual income: ${money(c.annual_income as number)} / year`);
    lines.push(`Provider/scheme: ${(c.pension_provider ?? "").trim()}`);
    lines.push(`Start age: ${c.access_age}`);
  }

  return lines.join("\n");
}

// True when a proposed/committed change concerns a pension.
export function isPensionChange(c: { type?: string | null }): boolean {
  return c.type === "pension";
}
