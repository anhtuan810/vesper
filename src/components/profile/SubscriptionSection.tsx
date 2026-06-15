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

const SECTION_LABEL_STYLE: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: "var(--text-faint)",
  marginBottom: 10,
};

const CARD_STYLE: React.CSSProperties = {
  background: "var(--surface)",
  border: "0.5px solid var(--border)",
  borderRadius: 14,
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
  const { data, loading, refreshUntilEntitled } = useSubscription();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;

  // Show the subscription card (not the trial CTA) for an active/trialing user and
  // for a past_due subscriber still inside the period they paid for — the Manage
  // action then takes them to update their card, instead of starting a new sub.
  const hasSubscription =
    data != null && (data.status === "trialing" || data.status === "active" || data.status === "past_due");

  // Days remaining in the trial — only meaningful while trialing. Computed from
  // the same date the "Trial ends" row shows, so the two never disagree.
  const daysLeft =
    hasSubscription && data && data.status === "trialing"
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
        await purchases.purchasePlan(plan);
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
      <div style={SECTION_LABEL_STYLE}>Your subscription</div>

      {hasSubscription && data ? (
        <div style={CARD_STYLE}>
          <Row
            label="Plan"
            value={data.plan ? PLAN_LABEL[data.plan] : "Volnar"}
            badge={STATUS_LABEL[data.status!]}
            badgeColor={statusColor(data)}
          />
          <Row label={dateLabel(data)} value={formatRenewalDate(renewalDate(data)) ?? "—"} />
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
              padding: "14px 16px",
              textAlign: "left",
              fontSize: 15,
              fontWeight: 500,
              color: "var(--accent)",
              background: "transparent",
              border: "none",
              borderTop: "0.5px solid var(--border)",
              cursor: busy ? "default" : "pointer",
              fontFamily: "var(--font-sans)",
            }}
          >
            {busy ? "Opening…" : "Manage subscription"}
          </button>
        </div>
      ) : (
        <div style={{ ...CARD_STYLE, padding: "18px 16px" }}>
          <div
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 17,
              fontWeight: 500,
              color: "var(--text)",
              marginBottom: 6,
              fontVariationSettings: "'opsz' 18",
            }}
          >
            Start your free trial
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55, marginBottom: 14 }}>
            {TRIAL_DAYS} days free, then {formatPrice(PLAN_PRICES.annual)} per year or{" "}
            {formatPrice(PLAN_PRICES.monthly)} per month. Cancel anytime.
          </div>
          <button
            onClick={() => startTrial("annual")}
            disabled={busy}
            style={{
              width: "100%",
              padding: "13px 16px",
              borderRadius: 12,
              border: "none",
              background: "var(--accent)",
              color: "#fff",
              fontSize: 14.5,
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
        <div style={{ fontSize: 12, color: "var(--negative)", marginTop: -14, marginBottom: 20, lineHeight: 1.5 }}>
          {error}
        </div>
      )}
    </>
  );
}

function renewalDate(view: SubscriptionView): string | null {
  if (view.status === "trialing") return view.trialEnd ?? view.currentPeriodEnd;
  return view.currentPeriodEnd;
}

function dateLabel(view: SubscriptionView): string {
  if (view.status === "trialing") return "Trial ends";
  if (view.status === "past_due") return "Payment due";
  if (view.cancelAtPeriodEnd) return "Access until";
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
        gap: 12,
        padding: "14px 16px",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      <div style={{ flex: 1, fontSize: 13, color: "var(--text-dim)" }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: "var(--text)" }}>{value}</span>
        {badge && (
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.03em",
              color: badgeColor ?? "var(--accent)",
              background: "var(--surface-elev)",
              border: "0.5px solid var(--border)",
              borderRadius: 999,
              padding: "2px 8px",
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
