export interface MortgageAssetInput {
  type: string;
  mortgage_balance?: number | null;
  mortgage_balance_recorded_at?: string | null;
  mortgage_rate?: number | null;
  monthly_payment?: number | null;
  mortgage_type?: string | null;
}

/**
 * Projects the stored mortgage_balance forward from mortgage_balance_recorded_at
 * to asOf using standard amortisation. Pure function — no I/O.
 *
 * Returns 0 for non-real-estate assets and for mortgages with no balance.
 * Returns the stored balance unchanged when recorded_at is absent or asOf ≤ recorded_at.
 */
export function computeCurrentBalance(
  asset: MortgageAssetInput,
  asOf: Date = new Date(),
): number {
  if (asset.type !== "real_estate") return 0;
  const B0 = asset.mortgage_balance ?? 0;
  if (B0 <= 0) return 0;

  if (!asset.mortgage_balance_recorded_at) return B0;

  const recordedAt = new Date(asset.mortgage_balance_recorded_at);
  if (asOf <= recordedAt) return B0;

  const n = monthsBetween(recordedAt, asOf);
  if (n <= 0) return B0;

  const r = (asset.mortgage_rate ?? 0) / 1200;
  const P = asset.monthly_payment ?? 0;
  const type = asset.mortgage_type;

  if (type === "interest_only") return B0;

  if (type === "linear") {
    // Fixed principal per month = payment minus interest on the recorded balance.
    // This identifies the constant principal component of a linear mortgage.
    const fixedPrincipal = r > 0 ? P - B0 * r : P;
    if (fixedPrincipal <= 0) return B0;
    return Math.max(0, B0 - fixedPrincipal * n);
  }

  // Annuity (default for unknown type)
  if (r > 0 && P > B0 * r) {
    const factor = Math.pow(1 + r, n);
    return Math.max(0, B0 * factor - P * (factor - 1) / r);
  }
  if (r === 0 && P > 0) {
    return Math.max(0, B0 - P * n);
  }
  return B0;
}

export type MortgageStatus = "ok" | "payment_below_interest";

export interface MortgageProjection {
  // "payment_below_interest" means the payment never covers the monthly interest,
  // so the loan cannot amortise — payoffDate is null and the curve is empty.
  status: MortgageStatus;
  remainingMonths: number;
  payoffDate: Date | null;
  totalInterestPaid: number;
  totalInterestRemaining: number;
  principalPaid: number;
  balanceCurve: { date: Date; balance: number }[];
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

export function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

/**
 * The contractual annuity payment that amortises `balance` to zero over
 * `totalMonths` at `annualRate` (percent). Deterministic — used only when a
 * stated payment is absent but a full term is known. Returns 0 on bad input.
 */
export function annuityPayment(balance: number, annualRate: number, totalMonths: number): number {
  if (totalMonths <= 0 || balance <= 0) return 0;
  const r = annualRate / 1200;
  if (r === 0) return balance / totalMonths;
  return (balance * r) / (1 - Math.pow(1 + r, -totalMonths));
}

// A non-amortising mortgage (payment never covers interest): no payoff, no curve.
function paymentBelowInterest(): MortgageProjection {
  return {
    status: "payment_below_interest",
    remainingMonths: 0,
    payoffDate: null,
    totalInterestPaid: 0,
    totalInterestRemaining: 0,
    principalPaid: 0,
    balanceCurve: [],
  };
}

export function projectMortgage(
  balance: number,
  annualRate: number,
  monthlyPayment: number,
  type: "annuity" | "linear" | "interest_only",
  startDate: Date,
  today: Date = new Date(),
  endDate?: Date,
): MortgageProjection {
  const r = annualRate / 1200;
  const elapsedMonths = Math.max(0, monthsBetween(startDate, today));

  if (type === "interest_only") {
    // Interest-only never amortises from payments — the payoff IS the end date.
    // Without an end date there is no payoff and no schedule to draw (no fabricated term).
    if (!endDate) {
      return {
        status: "ok",
        remainingMonths: 0,
        payoffDate: null,
        totalInterestPaid: balance * r * elapsedMonths,
        totalInterestRemaining: 0,
        principalPaid: 0,
        balanceCurve: [],
      };
    }
    const totalMonths = Math.max(0, monthsBetween(startDate, endDate));
    const curve: { date: Date; balance: number }[] = [];
    for (let i = 0; i <= totalMonths; i++) {
      curve.push({ date: addMonths(startDate, i), balance });
    }
    return {
      status: "ok",
      remainingMonths: Math.max(0, totalMonths - elapsedMonths),
      payoffDate: endDate,
      totalInterestPaid: balance * r * elapsedMonths,
      totalInterestRemaining: 0,
      principalPaid: 0,
      balanceCurve: curve,
    };
  }

  // Amortising types (annuity, linear): a payment that does not cover the monthly
  // interest can never reduce the balance — flag it rather than inventing a term.
  if (r > 0 && monthlyPayment <= balance * r) return paymentBelowInterest();
  if (r === 0 && monthlyPayment <= 0) return paymentBelowInterest();

  if (type === "linear") {
    const totalMonths = endDate
      ? Math.max(1, monthsBetween(startDate, endDate))
      : Math.ceil(elapsedMonths + balance / (monthlyPayment - balance * r));

    const remaining = Math.max(1, totalMonths - elapsedMonths);
    const B0 = balance * totalMonths / remaining;
    const fixedPrincipal = B0 / totalMonths;

    const curve: { date: Date; balance: number }[] = [];
    let b = B0;
    let interestPaid = 0;
    let interestRemaining = 0;

    for (let i = 0; i <= totalMonths && b > 0; i++) {
      curve.push({ date: addMonths(startDate, i), balance: Math.max(0, b) });
      const interest = b * r;
      if (i < elapsedMonths) interestPaid += interest;
      else interestRemaining += interest;
      b -= fixedPrincipal;
    }
    curve.push({ date: addMonths(startDate, totalMonths), balance: 0 });

    return {
      status: "ok",
      remainingMonths: remaining,
      payoffDate: endDate ?? addMonths(startDate, totalMonths),
      totalInterestPaid: interestPaid,
      totalInterestRemaining: interestRemaining,
      principalPaid: Math.round(B0 - balance),
      balanceCurve: curve,
    };
  }

  // Annuity — payment > interest guaranteed above, so the log argument is in (0,1).
  let totalMonths: number;
  if (endDate) {
    totalMonths = Math.max(1, monthsBetween(startDate, endDate));
  } else if (r > 0) {
    const remaining = Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
    totalMonths = elapsedMonths + remaining;
  } else {
    totalMonths = elapsedMonths + Math.ceil(balance / monthlyPayment);
  }

  const n = totalMonths;
  const B0 = r > 0
    ? monthlyPayment * (1 - Math.pow(1 + r, -n)) / r
    : monthlyPayment * n;

  const curve: { date: Date; balance: number }[] = [];
  let b = B0;
  let interestPaid = 0;
  let interestRemaining = 0;

  for (let i = 0; i < n && b > 0.01; i++) {
    curve.push({ date: addMonths(startDate, i), balance: Math.max(0, b) });
    const interest = b * r;
    const principal = monthlyPayment - interest;
    if (i < elapsedMonths) interestPaid += interest;
    else interestRemaining += interest;
    b -= principal;
  }
  curve.push({ date: addMonths(startDate, n), balance: 0 });

  const remainingMonths = Math.max(0, n - elapsedMonths);

  return {
    status: "ok",
    remainingMonths,
    payoffDate: endDate ?? addMonths(startDate, n),
    totalInterestPaid: interestPaid,
    totalInterestRemaining: interestRemaining,
    principalPaid: Math.round(B0 - balance),
    balanceCurve: curve,
  };
}

export function formatTimeRemaining(months: number): string {
  if (months <= 0) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0) return `${m}m`;
  if (m === 0) return `${y}y`;
  return `${y}y ${m}m`;
}

export function formatPayoffDate(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
