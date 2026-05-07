export interface MortgageProjection {
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

function monthsBetween(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
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
    const totalMonths = endDate ? monthsBetween(startDate, endDate) : 360;
    const curve: { date: Date; balance: number }[] = [];
    for (let i = 0; i <= totalMonths; i++) {
      curve.push({ date: addMonths(startDate, i), balance });
    }
    return {
      remainingMonths: Math.max(0, totalMonths - elapsedMonths),
      payoffDate: null,
      totalInterestPaid: balance * r * elapsedMonths,
      totalInterestRemaining: 0,
      principalPaid: 0,
      balanceCurve: curve,
    };
  }

  if (type === "linear") {
    const totalMonths = endDate
      ? monthsBetween(startDate, endDate)
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
      remainingMonths: remaining,
      payoffDate: endDate ?? addMonths(startDate, totalMonths),
      totalInterestPaid: interestPaid,
      totalInterestRemaining: interestRemaining,
      principalPaid: Math.round(B0 - balance),
      balanceCurve: curve,
    };
  }

  // Annuity
  let totalMonths: number;
  if (endDate) {
    totalMonths = monthsBetween(startDate, endDate);
  } else if (r > 0 && monthlyPayment > balance * r) {
    const remaining = Math.ceil(-Math.log(1 - (r * balance) / monthlyPayment) / Math.log(1 + r));
    totalMonths = elapsedMonths + remaining;
  } else {
    totalMonths = elapsedMonths + 360;
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
