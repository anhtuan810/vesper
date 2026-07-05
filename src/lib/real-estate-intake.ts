// Deterministic real-estate intake: the validation gate that guarantees an
// incomplete property can never commit — mirroring pension-intake.ts.
//
// A property (type='real_estate') is added with:
//   - REQUIRED: an address (enforced separately by the geocode gate), a current
//     value (or a purchase price + date the estimate engine can index forward),
//     and an EXPLICIT mortgage decision — the outstanding balance, or 0 when the
//     user confirms it's owned free and clear.
//   - REQUIRED WHEN THERE IS A MORTGAGE (balance > 0): mortgage_rate (the annual
//     interest rate; 0 is a valid answer for an interest-free loan), monthly_payment,
//     and mortgage_type (annuity | linear | interest_only). These are what the
//     payoff/"mortgage-free" projection (projectMortgage) and the live equity
//     amortisation (computeCurrentBalance) actually consume — without them the
//     balance sits frozen and no payoff date can be drawn.
//   - OPTIONAL: mortgage_start_date, mortgage_end_date (the end date is what gives
//     an interest-only mortgage a payoff date), property_type, size_sqm.
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
  country?: string | null;
  value?: number | null;
  buy_price?: number | null;
  buy_date?: string | null;
  mortgage_balance?: number | null;
  mortgage_rate?: number | null;
  monthly_payment?: number | null;
  mortgage_type?: string | null;
}

// The indicative estimate engine (CBS PBK) can only value NL property, so a
// purchase price + date is a resolvable value ONLY for a Netherlands property.
// Mirrors isNL in property-estimate-resolve.ts, kept local so the gate has no
// dependency on the estimate engine.
function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

export type RealEstateGateResult = { ok: true } | { ok: false; question: string };

// The repayment structures the payoff engine (projectMortgage) understands.
const VALID_MORTGAGE_TYPES = new Set(["annuity", "linear", "interest_only"]);

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
  // Value must be resolvable: either a stated current value, or — FOR A NL
  // PROPERTY ONLY — a purchase (price + date) the deterministic CBS estimate
  // engine can index forward to today. For a non-NL property the engine returns
  // nothing, so a purchase price is NOT a resolvable value: require the current
  // value here (at intake) rather than letting a complete-looking proposal pass
  // and then bounce at commit when the estimate comes back unavailable.
  const hasValue = isPositiveNumber(c.value);
  const canEstimate =
    isNL(c.country) &&
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

  // When there IS a mortgage, the payoff/"mortgage-free" projection needs the
  // rate, the monthly payment, and the repayment structure — collect all three.
  // (Owned-outright properties, balance 0, need none of this.)
  if (c.mortgage_balance > 0) {
    // Rate: 0 is a valid explicit answer (an interest-free loan), so accept any
    // non-negative number; only a missing rate is unresolved.
    if (!isNonNegativeNumber(c.mortgage_rate)) {
      return { ok: false, question: "What's the mortgage interest rate? (If it's interest-free, just say 0.)" };
    }
    if (!isPositiveNumber(c.monthly_payment)) {
      return { ok: false, question: "What's the monthly mortgage payment?" };
    }
    if (typeof c.mortgage_type !== "string" || !VALID_MORTGAGE_TYPES.has(c.mortgage_type)) {
      return { ok: false, question: "What kind of mortgage is it — annuity, linear, or interest-only?" };
    }
  }

  return { ok: true };
}

// True when a proposed/committed change concerns a property.
export function isRealEstateChange(c: { type?: string | null }): boolean {
  return c.type === "real_estate";
}
