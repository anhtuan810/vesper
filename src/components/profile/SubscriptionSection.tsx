"use client";

import { useState } from "react";
import { useSubscription } from "@/components/SubscriptionProvider";
import { apiFetch } from "@/lib/api";
import { isNative } from "@/lib/platform";
import {
  APP_STORE_SUBSCRIPTIONS_URL,
  PLAY_STORE_SUBSCRIPTIONS_URL,
  PLAN_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  formatPrice,
  formatRenewalDate,
  PLAN_PRICES,
  TRIAL_DAYS,
  trialDaysLeft,
  formatTrialDaysLeft,
  type PlanId,
  type SubscriptionView,
} from "@/lib/subscription";

const CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--border)",
  borderRadius: "var(--radius-lg)",
  marginBottom: 24,
  overflow: "hidden",
};

// Opens a URL: a new tab on web, the system browser on native (App Store / Play
// subscription pages).
async function openUrl(url: string) {
  if (isNative()) {
    try {
      const { Browser } = await import("@capacitor/browser");
      await Browser.open({ url });
      return;
    } catch {
      // fall through to window.open
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

function statusColor(view: SubscriptionView): string {
  if (view.status === "active" || view.status === "trialing") return "var(--accent)";
  if (view.status === "past_due") return "var(--amber-deep, var(--negative-text))";
  return "var(--text-faint)";
}

// "Your subscription" — plan, status, renewal/expiry date (nl-NL), and where it
// was purchased, with a Manage action that routes to the correct destination per
// source. Shows a trial CTA when there is no active subscription.
export function SubscriptionSection() {
  const { data, loading, entitled, refreshUntilEntitled, markEntitledOptimistic } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  // The demo/review account runs on a seeded entitlement, not real billing — hide
  // the whole subscription card. Settings offers a path to a real subscription.
  if (data?.isDemo) return null;

  // Show the subscription card (not the trial CTA) for an active/trialing user and
  // for a past_due subscriber still inside the period they paid for — the Manage
  // action then takes them to update their card, instead of starting a new sub.
  const hasSubscription =
    data != null && (data.status === "trialing" || data.status === "active" || data.status === "past_due");

  // Bridge the window between a just-completed native purchase and the webhook
  // writing the server entitlement: the client is optimistically entitled (set
  // below, or by the paywall's buy handler) while `data` hasn't caught up yet.
  // Show an "activating" state instead of the trial CTA, so a paying user never
  // sees "Start your free trial" right after buying and re-purchases by mistake.
  const activating = !hasSubscription && entitled;

  // Days remaining in the trial — only meaningful while trialing. Computed from
  // the same date the "Trial ends" row shows, so the two never disagree.
  // Trial countdown — only while genuinely trialing and not cancelling. A cancelling
  // trial shows "Access until <date> · Cancels" instead, so a "7 days left" row would
  // contradict it.
  const daysLeft =
    hasSubscription && data && data.status === "trialing" && !data.cancelAtPeriodEnd
      ? trialDaysLeft(data.trialEnd ?? data.currentPeriodEnd)
      : null;

  async function manage() {
    if (!data) return;
    setBusy(true);
    setError(null);
    try {
      if (data.source === "stripe") {
        const res = await apiFetch("/api/billing-portal", { method: "POST" });
        if (!res.ok) throw new Error();
        const { url } = (await res.json()) as { url: string };
        window.location.href = url;
        return;
      }
      const url =
        data.source === "play_store" ? PLAY_STORE_SUBSCRIPTIONS_URL : APP_STORE_SUBSCRIPTIONS_URL;
      await openUrl(url);
    } catch {
      setError("We couldn't open the billing settings. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function startTrial(plan: PlanId) {
    setBusy(true);
    setError(null);
    if (isNative()) {
      let purchases: typeof import("@/lib/native/purchases") | null = null;
      try {
        purchases = await import("@/lib/native/purchases");
        const info = await purchases.purchasePlan(plan);
        // Reflect the purchase immediately so the card flips to "activating" rather
        // than showing the trial CTA again (which invited a second purchase).
        if (purchases.isEntitledFromInfo(info)) markEntitledOptimistic();
        // Poll until the webhook writes the entitlement, so access persists past
        // the next cold start rather than depending on a single immediate read.
        await refreshUntilEntitled();
      } catch (e) {
        if (!purchases || !purchases.isPurchaseCancelled(e)) {
          setError("The purchase didn't complete. Please try again.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    try {
      const res = await apiFetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError("We couldn't start checkout. Please try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <div className="eyebrow" style={{ marginBottom: "var(--space-row)" }}>Your subscription</div>

      {hasSubscription && data ? (
        <div style={CARD_STYLE}>
          <Row
            label="Plan"
            value={data.plan ? PLAN_LABEL[data.plan] : "Volnar"}
            badge={STATUS_LABEL[data.status!]}
            badgeColor={statusColor(data)}
          />
          <Row
            label={dateLabel(data)}
            value={formatRenewalDate(renewalDate(data)) ?? "—"}
            badge={data.cancelAtPeriodEnd ? "Cancels" : undefined}
            badgeColor="var(--amber-deep, var(--negative-text))"
          />
          {daysLeft != null && (
            <Row
              label="Trial remaining"
              value={formatTrialDaysLeft(daysLeft)}
              badge={daysLeft <= 3 ? "Ending soon" : undefined}
              badgeColor="var(--amber-deep, var(--negative-text))"
            />
          )}
          {data.source && <Row label="Purchased via" value={SOURCE_LABEL[data.source]} />}
          <button
            onClick={manage}
            disabled={busy}
            style={{
              width: "100%",
              padding: "14px var(--space-card)",
              textAlign: "left",
              fontSize: "var(--fs-body)",
              fontWeight: 500,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              borderTop: "0.5px solid var(--border)",
              cursor: busy ? "default" : "pointer",
              fontFamily: "var(--font-ui)",
            }}
          >
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        </div>
      ) : activating ? (
        <div style={{ ...CARD_STYLE, padding: "18px var(--space-card)" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-subhead)",
              fontWeight: 500,
              letterSpacing: "var(--tracking-subhead)",
              color: "var(--text)",
              marginBottom: 6,
              fontVariationSettings: "'opsz' 18",
            }}
          >
            Subscription activating…
          </div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)" }}>
            Your purchase went through. We&apos;re finalizing your access — this can take a
            moment. No need to buy again.
          </div>
        </div>
      ) : (
        <div style={{ ...CARD_STYLE, padding: "18px var(--space-card)" }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "var(--fs-subhead)",
              fontWeight: 500,
              letterSpacing: "var(--tracking-subhead)",
              color: "var(--text)",
              marginBottom: 6,
              fontVariationSettings: "'opsz' 18",
            }}
          >
            Start your free trial
          </div>
          <div style={{ fontSize: "var(--fs-caption)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", marginBottom: 14 }}>
            {TRIAL_DAYS} days free, then {formatPrice(PLAN_PRICES.annual)} per year or{" "}
            {formatPrice(PLAN_PRICES.monthly)} per month. Cancel anytime.
          </div>
          <button
            onClick={() => startTrial("annual")}
            disabled={busy}
            style={{
              width: "100%",
              padding: "13px var(--space-card)",
              borderRadius: "var(--radius-lg)",
              border: "none",
              background: "var(--accent)",
              color: "var(--bg)",
              fontSize: "var(--fs-body)",
              fontWeight: 600,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? "One moment…" : `Start ${TRIAL_DAYS}-day free trial`}
          </button>
        </div>
      )}

      {error && (
        <div style={{ fontSize: "var(--fs-caption)", color: "var(--negative)", marginTop: -14, marginBottom: "var(--space-5)", lineHeight: "var(--lh-body)" }}>
          {error}
        </div>
      )}
    </>
  );
}

function renewalDate(view: SubscriptionView): string | null {
  // When cancelling, the real access-end date is cancel_at (which may precede the
  // period/trial end); fall back to the period/trial end when it isn't set.
  if (view.cancelAtPeriodEnd && view.cancelAt) return view.cancelAt;
  if (view.status === "trialing") return view.trialEnd ?? view.currentPeriodEnd;
  return view.currentPeriodEnd;
}

function dateLabel(view: SubscriptionView): string {
  if (view.status === "past_due") return "Payment due";
  // A subscription set to cancel surfaces its end date — including during a trial,
  // which would otherwise read as a plain "Trial ends" and hide the cancellation.
  if (view.cancelAtPeriodEnd) return "Access until";
  if (view.status === "trialing") return "Trial ends";
  return "Renews";
}

function Row({
  label,
  value,
  badge,
  badgeColor,
}: {
  label: string;
  value: string;
  badge?: string;
  badgeColor?: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: "14px var(--space-card)",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, fontSize: "var(--fs-caption)", color: "var(--text-dim)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <span className="tnum" style={{ fontSize: "var(--fs-meta)", fontWeight: 500, color: "var(--text)" }}>{value}</span>
        {badge && (
          <span
            className="eyebrow"
            style={{
              color: badgeColor ?? "var(--accent)",
              background: "var(--surface-elev)",
              border: "0.5px solid var(--border)",
              borderRadius: "var(--radius-pill)",
              padding: "2px var(--space-2)",
              whiteSpace: "nowrap",
            }}
          >
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}
