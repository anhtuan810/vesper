"use client";

import { useMemo } from "react";
import {
  computeCurrentBalance,
  projectMortgage,
  annuityPayment,
  monthsBetween,
} from "@/lib/mortgage";
import { ScenarioCueLine } from "@/components/scenario/ScenarioCueLine";
import type { RealEstateAsset } from "@/lib/supabase";

// Tappable, deterministic mortgage projection line — the affordance that
// replaced the "What if?" pill below the amortization curve. It reuses the same
// mortgage helpers the card uses (so the baseline payoff matches the card to the
// month) and then simulates one extra payment to find how much sooner the loan
// clears. Tapping opens the existing per-property scenario flow. All math here;
// no model produces any number.

const EXTRA_PER_MONTH = 100; // €/month extra principal in the what-if line
const MAX_MONTHS = 1200; // 100-year safety cap on the amortization loop
// "At least ~1 year earlier" threshold for showing the extra-payment line.
const MIN_MONTHS_SAVED = 12;

function addMonths(date: Date, n: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// Reducing-balance amortization with a fixed extra principal payment each month.
// monthly rate = annual / 12; iterate until the balance clears. Returns months to
// payoff, or null when the (boosted) payment can't cover the monthly interest.
function monthsToPayoffWithExtra(
  balance: number,
  annualRatePct: number,
  monthlyPayment: number,
  extra: number,
): number | null {
  if (balance <= 0) return 0;
  const r = annualRatePct / 1200;
  const pmt = monthlyPayment + extra;
  if (r > 0 && pmt <= balance * r) return null;
  if (r === 0 && pmt <= 0) return null;
  let b = balance;
  let months = 0;
  while (b > 0.01 && months < MAX_MONTHS) {
    b = b + b * r - pmt;
    months++;
  }
  return b > 0.01 ? null : months;
}

export function MortgageProjectionLine({
  asset,
  onExplore,
}: {
  asset: RealEstateAsset;
  onExplore: () => void;
}) {
  const {
    mortgage_rate: rate,
    monthly_payment: payment,
    mortgage_type: type,
    mortgage_start_date: startStr,
    mortgage_end_date: endStr,
    buy_date: buyDateStr,
  } = asset;

  const balance = computeCurrentBalance(asset);

  // Mirror the card's input derivation exactly so the baseline payoff/years-to-go
  // are identical to what the card shows: a REAL start date (stated start, else
  // buy date), and the stated payment — or the contractual annuity payment only
  // when a full term is known.
  const view = useMemo(() => {
    if (balance <= 0 || rate == null || type == null) return null;
    const realStartStr = startStr ?? buyDateStr ?? null;
    if (!realStartStr) return null;

    const startDate = new Date(realStartStr);
    const endDate = endStr ? new Date(endStr) : undefined;

    let pmt: number | null = payment ?? null;
    if (pmt == null && type !== "interest_only") {
      if (endDate && balance > 0) {
        const rem = monthsBetween(new Date(), endDate);
        if (rem > 0) pmt = annuityPayment(balance, rate, rem);
      }
      if (pmt == null) return null;
    }

    const proj = projectMortgage(
      balance,
      rate,
      pmt ?? 0,
      type as "annuity" | "linear" | "interest_only",
      startDate,
      new Date(),
      endDate,
    );
    if (proj.status !== "ok" || !proj.payoffDate || proj.remainingMonths <= 0) return null;

    const yearsToGo = Math.round(proj.remainingMonths / 12);

    // Interest-only never amortizes from payments, so an extra principal payment
    // has no defined effect on the existing schedule — show the fallback.
    let sooner: { newYear: number; yearsSooner: number } | null = null;
    if (type !== "interest_only" && pmt != null) {
      const newMonths = monthsToPayoffWithExtra(balance, rate, pmt, EXTRA_PER_MONTH);
      if (newMonths != null) {
        const saved = proj.remainingMonths - newMonths;
        if (saved >= MIN_MONTHS_SAVED) {
          sooner = {
            newYear: addMonths(new Date(), newMonths).getFullYear(),
            yearsSooner: Math.round(saved / 12),
          };
        }
      }
    }

    return { yearsToGo, sooner };
  }, [balance, rate, type, payment, startStr, endStr, buyDateStr]);

  if (!view) return null;

  if (view.sooner) {
    const { newYear, yearsSooner } = view.sooner;
    const soonerLabel = `${yearsSooner} ${yearsSooner === 1 ? "year" : "years"} sooner`;
    return (
      <ScenarioCueLine
        statement={<>Add €{EXTRA_PER_MONTH} a month and you’re mortgage-free by {newYear}, {soonerLabel}.{" "}</>}
        clause="See what else shortens it"
        ariaLabel={`Adding €${EXTRA_PER_MONTH} a month makes you mortgage-free by ${newYear}, ${soonerLabel}. Explore what else shortens your mortgage.`}
        onActivate={onExplore}
        telemetryTemplate="mortgage_extra_payment"
        impressionKey={asset.id}
      />
    );
  }

  return (
    <ScenarioCueLine
      statement={<>{view.yearsToGo} {view.yearsToGo === 1 ? "year" : "years"} to go.{" "}</>}
      clause="See how much sooner you could be"
      ariaLabel={`${view.yearsToGo} ${view.yearsToGo === 1 ? "year" : "years"} to go. Explore how much sooner you could be mortgage-free.`}
      onActivate={onExplore}
      telemetryTemplate="mortgage_extra_payment"
      impressionKey={asset.id}
    />
  );
}
