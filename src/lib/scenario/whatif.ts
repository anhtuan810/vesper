"use client";

// Per-asset "What if?" entry for property mortgages. CRITICAL: every figure in
// the seeded chips is computed HERE by deterministic code (projectMortgage /
// annuityPayment) — the chat only narrates the supplied figures (the
// narrate-scenario guardrail rejects any number not in the set). The model never
// does the arithmetic. Plumbing mirrors the scenario-explore entry: desktop fires
// an event the shell consumes; mobile stashes the seed and navigates to /chat.

import {
  projectMortgage,
  annuityPayment,
  computeCurrentBalance,
  formatPayoffDate,
  formatTimeRemaining,
} from "@/lib/mortgage";
import { formatMoney, type DisplayCurrency } from "@/lib/money";
import type { ChatSeed } from "@/lib/chat-seeds";
import type { ScenarioHandoff } from "@/lib/scenario/handoff";
import type { RealEstateAsset } from "@/lib/supabase";

export const WHATIF_KEY = "volnar.scenario.whatif";
export const WHATIF_EVENT = "volnar:scenario-whatif";

export function stashWhatIfSeed(seed: ChatSeed): void {
  try { sessionStorage.setItem(WHATIF_KEY, JSON.stringify(seed)); } catch {}
}

export function takeWhatIfSeed(): ChatSeed | null {
  try {
    const raw = sessionStorage.getItem(WHATIF_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(WHATIF_KEY);
    return JSON.parse(raw) as ChatSeed;
  } catch {
    return null;
  }
}

/** Desktop: stash + fire the event the chat shell consumes (handled in place).
 *  Mobile: stash only; the caller navigates to /chat which picks it up. */
export function requestWhatIf(seed: ChatSeed, isDesktop: boolean): boolean {
  stashWhatIfSeed(seed);
  if (isDesktop) {
    window.dispatchEvent(new CustomEvent(WHATIF_EVENT));
    return true;
  }
  return false;
}

// Builds the property mortgage "what if" seed. Returns null when there isn't
// enough to compute deterministically (no current balance or no rate on file).
export function buildPropertyWhatIfSeed(
  asset: RealEstateAsset,
  displayCurrency: DisplayCurrency,
): ChatSeed | null {
  const balance = computeCurrentBalance(asset);
  const rate = asset.mortgage_rate ?? null;
  if (balance <= 0 || rate == null) return null;

  const cur = asset.currency || "USD";
  const name = asset.name;
  const money = (n: number) => formatMoney(n, cur, displayCurrency);
  const rateStr = `${rate.toFixed(2)}%`;
  const balanceStr = money(balance);
  const type = (asset.mortgage_type ?? "annuity") as "annuity" | "linear" | "interest_only";

  const chips: string[] = [];
  const chipActions: Record<string, ScenarioHandoff> = {};

  // Chip 1 — pay off in 5 years. Figure = annuityPayment(balance, rate, 60).
  const pay5 = annuityPayment(balance, rate, 60);
  const pay5Str = money(pay5);
  if (pay5 > 0) {
    const label = `Pay off ${name} in 5 years?`;
    chips.push(label);
    chipActions[label] = {
      userMessage: `How much per month to pay off ${name} in 5 years?`,
      description: `Clearing the ${name} mortgage — balance ${balanceStr} at ${rateStr} — over 5 years takes 60 equal monthly payments of ${pay5Str}. Narrate using only these figures.`,
      figures: [pay5Str, balanceStr, rateStr, "5", "60"],
      fallback: `Clearing ${name} in five years would take ${pay5Str} a month — the ${balanceStr} balance at ${rateStr}, paid down over 60 months.`,
    };
  }

  // Chip 2 — rate reset. Figure = annuityPayment(balance, newRate, 60) vs current.
  const newRate = Math.round((rate + 2) * 100) / 100;
  const payNew = annuityPayment(balance, newRate, 60);
  if (pay5 > 0 && payNew > 0) {
    const payNewStr = money(payNew);
    const newRateStr = `${newRate.toFixed(2)}%`;
    const label = `Rate resets to ${newRateStr}?`;
    chips.push(label);
    chipActions[label] = {
      userMessage: `What if ${name}'s rate reset to ${newRateStr}?`,
      description: `If ${name}'s rate reset from ${rateStr} to ${newRateStr}, clearing the ${balanceStr} balance over the same 5 years would cost ${payNewStr} a month instead of ${pay5Str}. Narrate using only these figures.`,
      figures: [payNewStr, pay5Str, balanceStr, rateStr, newRateStr, "5"],
      fallback: `At ${newRateStr} rather than ${rateStr}, clearing ${name} in five years would cost ${payNewStr} a month instead of ${pay5Str}.`,
    };
  }

  // Chip 3 — overpay. Uses projectMortgage anchored at today (a "from now" payoff)
  // and needs a current monthly payment that actually amortises. Figure = the new
  // payoff date and the time saved. Omitted when no usable payment is on file.
  const payment = asset.monthly_payment ?? null;
  if (payment != null && payment > 0) {
    const today = new Date();
    const X = 200; // a round monthly overpay in the property's currency
    const base = projectMortgage(balance, rate, payment, type, today, today);
    const over = projectMortgage(balance, rate, payment + X, type, today, today);
    if (
      base.status === "ok" &&
      over.status === "ok" &&
      over.payoffDate &&
      base.remainingMonths > over.remainingMonths
    ) {
      const overStr = money(X);
      const newDateStr = formatPayoffDate(over.payoffDate);
      const savedStr = formatTimeRemaining(base.remainingMonths - over.remainingMonths);
      const label = `Overpay ${overStr}/month?`;
      chips.push(label);
      chipActions[label] = {
        userMessage: `What if I overpay ${overStr} a month on ${name}?`,
        description: `Adding ${overStr} to the monthly payment on ${name} clears it by ${newDateStr} — about ${savedStr} sooner. Narrate using only these figures.`,
        figures: [overStr, newDateStr, savedStr],
        fallback: `Overpaying ${overStr} a month would clear ${name} by ${newDateStr} — roughly ${savedStr} sooner.`,
      };
    }
  }

  if (chips.length === 0) return null;

  return {
    message: `Let's pressure-test ${name}'s mortgage — I'll run the numbers.`,
    chips,
    chipActions,
  };
}
