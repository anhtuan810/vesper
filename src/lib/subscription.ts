// Shared subscription types and pure helpers. No secrets and no SDKs, so this is
// safe to import from both client components and server routes. Stripe price IDs
// and RevenueCat product IDs live in env (server) or come from RevenueCat
// offerings (client); only the human-facing amounts and labels live here.

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired"
  | "incomplete";

// Which processor/store owns the active entitlement — drives the Manage action.
export type SubscriptionSource = "stripe" | "app_store" | "play_store";

export type PlanId = "monthly" | "annual";

// The two statuses that unlock the app. The 14-day card-on-file trial counts as
// access, so a trialing user is in, not gated.
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  "trialing",
  "active",
]);

export function isEntitled(status: SubscriptionStatus | null | undefined): boolean {
  return status != null && ENTITLED_STATUSES.has(status);
}

// The shape returned by GET /api/subscription and consumed by the paywall and the
// Profile "Your subscription" section. `status === null` means no subscription row
// exists yet (never subscribed) — distinct from an expired/canceled one.
export interface SubscriptionView {
  entitled: boolean;
  status: SubscriptionStatus | null;
  source: SubscriptionSource | null;
  plan: PlanId | null;
  currentPeriodEnd: string | null; // ISO 8601
  trialEnd: string | null;         // ISO 8601
  cancelAtPeriodEnd: boolean;
}

// ── Plan pricing (display copy) ────────────────────────────────────────────────
// Amounts shown across the paywall, Profile, and marketing. These are display
// values only — the real charge is driven by the env price IDs. 14-day trial,
// then monthly €9.99 or annual €99.99 (annual preferred).
export const TRIAL_DAYS = 14;

export const PLAN_PRICES: Record<PlanId, number> = {
  monthly: 9.99,
  annual: 99.99,
};

// Whole months saved on the annual plan vs paying monthly for a year (→ 2).
export const ANNUAL_MONTHS_FREE = Math.round(
  (PLAN_PRICES.monthly * 12 - PLAN_PRICES.annual) / PLAN_PRICES.monthly,
);

// ── Formatting ─────────────────────────────────────────────────────────────────
// Currency mirrors the app's existing money formatting (en-US, € symbol — see
// src/lib/money.ts), so prices read "€9.99" consistently with every other figure.
const eurFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatPrice(amount: number): string {
  return eurFmt.format(amount);
}

// Renewal/expiry dates use nl-NL, e.g. "13 juni 2026".
const nlDateFmt = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatRenewalDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return nlDateFmt.format(d);
}

// Whole calendar days remaining in a trial, counting from `now` up to `trialEnd`
// (rounded up, so a trial ending in 6h still reads "1 day left"). Returns null
// when there is no usable trial end; clamps to 0 once the end has passed so a
// just-lapsed trial never shows a negative count.
export function trialDaysLeft(
  trialEnd: string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!trialEnd) return null;
  const end = new Date(trialEnd);
  if (Number.isNaN(end.getTime())) return null;
  const ms = end.getTime() - now.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

// Human label for the trial countdown shown in Profile, e.g. "9 days left".
export function formatTrialDaysLeft(days: number): string {
  if (days <= 0) return "Ends today";
  if (days === 1) return "1 day left";
  return `${days} days left`;
}

// ── Labels (English UI, matching the rest of the app) ──────────────────────────
export const STATUS_LABEL: Record<SubscriptionStatus, string> = {
  trialing: "Free trial",
  active: "Active",
  past_due: "Payment due",
  canceled: "Cancelled",
  expired: "Expired",
  incomplete: "Incomplete",
};

export const SOURCE_LABEL: Record<SubscriptionSource, string> = {
  stripe: "Web",
  app_store: "App Store",
  play_store: "Google Play",
};

export const PLAN_LABEL: Record<PlanId, string> = {
  monthly: "Monthly",
  annual: "Annual",
};

// Where the Manage action sends the user, per source. Stripe is resolved at call
// time (the billing-portal endpoint returns a one-time URL), so it is not a
// static link; the store URLs are stable deep links.
export const APP_STORE_SUBSCRIPTIONS_URL = "https://apps.apple.com/account/subscriptions";
export const PLAY_STORE_SUBSCRIPTIONS_URL = "https://play.google.com/store/account/subscriptions";
