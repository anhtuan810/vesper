// Deterministic real-estate intake: the validation gate that guarantees an
// incomplete property can never commit — mirroring pension-intake.ts.
//
// A property (type='real_estate') is added with:
//   - REQUIRED: an address (enforced separately by the geocode gate), a current
//     value (or a purchase price + date the estimate engine can index forward),
//     and an EXPLICIT mortgage decision — the outstanding balance, or 0 when the
//     user confirms it's owned free and clear.
//   - OPTIONAL: mortgage_rate, monthly_payment, mortgage_type, mortgage_start_date,
//     mortgage_end_date, property_type, size_sqm.
//
// The mortgage decision is the crux: the write path stores `mortgage_balance ?? null`,
// and a null balance renders as "Owned outright" in the UI. So a property added
// WITHOUT the model ever capturing the mortgage would silently show as owned
// outright even when the user told us there's a mortgage. This gate refuses to
// commit until the mortgage question has an explicit answer (a number — the
// balance, or 0 for outright), closing that hole. The LLM conducts the intake
// language; THIS module is the deterministic guarantee, enforced in both the
// proposal/echo step and the write path.

// ── Shape ─────────────────────────────────────────────────────────────────────
// The structural slice of a portfolio change the gate needs. Kept loose so both
// the propose/commit changes and existing asset rows fit it.
export interface RealEstateChangeInput {
  type?: string | null;
  value?: number | null;
  buy_price?: number | null;
  buy_date?: string | null;
  mortgage_balance?: number | null;
}

export type RealEstateGateResult = { ok: true } | { ok: false; question: string };

const isPositiveNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0;

// A mortgage balance of 0 is a valid, explicit answer ("owned free and clear"),
// so the mortgage decision accepts any non-negative finite number.
const isNonNegativeNumber = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

// ── The gate ────────────────────────────────────────────────────────────────────
// Returns { ok: true } only when a property add carries a resolvable value AND an
// explicit mortgage decision. Otherwise returns the single next question to ask.
// No silent defaults — in particular the mortgage question must be answered, so a
// property can never quietly land as "owned outright". Call on real-estate ADDS
// only (edits apply partial updates and must not be forced to re-state everything).
export function validateRealEstateChange(c: RealEstateChangeInput): RealEstateGateResult {
  // Value must be resolvable: either a stated current value, or a purchase
  // (price + date) the deterministic estimate engine can index forward to today.
  const hasValue = isPositiveNumber(c.value);
  const canEstimate =
    isPositiveNumber(c.buy_price) && typeof c.buy_date === "string" && c.buy_date.trim().length > 0;
  if (!hasValue && !canEstimate) {
    return { ok: false, question: "What's the property worth today? A rough current value is fine." };
  }

  // The mortgage decision must be explicit — never silently default to owned
  // outright. The model sets mortgage_balance to the outstanding amount, or to 0
  // when the user confirms it's owned free and clear. A missing value means the
  // question was never resolved, so refuse to commit.
  if (!isNonNegativeNumber(c.mortgage_balance)) {
    return {
      ok: false,
      question:
        "Is there a mortgage on it? Tell me the outstanding balance — or say it's owned free and clear.",
    };
  }

  return { ok: true };
}

// True when a proposed/committed change concerns a property.
export function isRealEstateChange(c: { type?: string | null }): boolean {
  return c.type === "real_estate";
}
