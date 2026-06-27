"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { VolnarLogo } from "@/components/VolnarLogo";
import { useUser, useSignOut } from "@/lib/hooks";
import { useSubscription } from "@/components/SubscriptionProvider";
import { apiFetch } from "@/lib/api";
import { createBrowserSupabase } from "@/lib/supabase";
import { isNative } from "@/lib/platform";
import {
  ANNUAL_MONTHS_FREE,
  APP_STORE_SUBSCRIPTIONS_URL,
  PLAY_STORE_SUBSCRIPTIONS_URL,
  PLAN_PRICES,
  TRIAL_DAYS,
  formatPrice,
  type PlanId,
} from "@/lib/subscription";

const TERMS_URL = "https://volnar.nl/terms";
const PRIVACY_URL = "https://volnar.nl/privacy";

// Opens a legal page: a normal new-tab link on web, the system browser on native.
async function openExternal(e: React.MouseEvent, url: string) {
  if (!isNative()) return;
  e.preventDefault();
  try {
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url });
  } catch {
    // Best effort — fall back to default navigation if the plugin is unavailable.
    window.open(url, "_blank");
  }
}

// Paywall-first access gate. Covers the app whenever the signed-in user is not
// trialing or active, using the platform-correct purchase path: Stripe Checkout
// on web, RevenueCat/StoreKit on native (with Restore). Renders nothing on public
// surfaces, while loading, when signed out, or when entitled — so it never
// flashes and unlocks without a restart once a purchase lands.
export function Paywall() {
  const pathname = usePathname();
  const { user, loading: userLoading } = useUser();
  const { loading: subLoading, entitled, data, refresh, refreshUntilEntitled, markEntitledOptimistic } =
    useSubscription();

  const [native, setNative] = useState(false);
  const [selected, setSelected] = useState<PlanId>("annual");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // StoreKit price strings (native), used in place of the static copy when known.
  const [storePrices, setStorePrices] = useState<{ monthly?: string; annual?: string }>({});

  const signOut = useSignOut();

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNative(isNative()), []);

  // Native: surface the real StoreKit prices from the current offering.
  useEffect(() => {
    if (!isNative() || !user) return;
    const userId = user.id;
    let cancelled = false;
    import("@/lib/native/purchases")
      .then(async ({ configurePurchases, getPlanPackages }) => {
        // Ensure the SDK is configured before reading offerings (configurePurchases
        // is idempotent), so we never call getOfferings pre-configure and log
        // "Purchases must be configured". configure needs the user id — hence the
        // user gate above.
        await configurePurchases(userId);
        const packs = await getPlanPackages();
        if (cancelled || !packs) return;
        setStorePrices({
          monthly: packs.monthly?.product.priceString,
          annual: packs.annual?.product.priceString,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/marketing");

  // Never gate public surfaces, the loading window, signed-out users, or entitled
  // users. Returning null here means the app renders normally.
  if (isPublic || userLoading || subLoading || !user || entitled) return null;

  async function buy(plan: PlanId) {
    setBusy(true);
    setError(null);
    if (native) {
      let purchases: typeof import("@/lib/native/purchases") | null = null;
      try {
        purchases = await import("@/lib/native/purchases");
        // Await configuration rather than racing the provider's fire-and-forget
        // configure, then make sure a package exists before purchasing.
        await purchases.ensureConfigured();
        const packages = await purchases.getPlanPackages();
        const pkg = plan === "annual" ? packages?.annual : packages?.monthly;
        if (!pkg) {
          console.log("[purchase] no packages");
          setError("Products unavailable. Please try again later.");
          return;
        }
        const info = await purchases.purchasePackage(pkg);
        if (purchases.isEntitledFromInfo(info)) markEntitledOptimistic();
        // Poll until the RevenueCat webhook has written the server entitlement, so
        // access survives the next cold start rather than relying on the optimistic
        // unlock alone.
        await refreshUntilEntitled();
      } catch (e) {
        if (!purchases || !purchases.isPurchaseCancelled(e)) {
          console.error("[purchase] failed", e);
          setError("The purchase didn't complete. Please try again.");
        }
      } finally {
        setBusy(false);
      }
      return;
    }
    // Web: hand off to Stripe Checkout (full redirect).
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

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const { restorePurchases, isEntitledFromInfo } = await import("@/lib/native/purchases");
      const info = await restorePurchases();
      if (isEntitledFromInfo(info)) {
        markEntitledOptimistic();
        await refreshUntilEntitled();
      } else {
        await refresh();
        setError("We couldn't find an active subscription to restore.");
      }
    } catch {
      setError("Restore didn't complete. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  // Recovery path for a user who already has a subscription that lapsed — most
  // importantly past_due (a failed renewal): send them to manage/fix the EXISTING
  // subscription, not to start a brand-new one. Routes by source: Stripe billing
  // portal (update card / reactivate) on web, the store's subscription page on
  // native.
  async function manageExisting() {
    setBusy(true);
    setError(null);
    try {
      if (data?.source === "app_store" || data?.source === "play_store") {
        const url =
          data.source === "play_store" ? PLAY_STORE_SUBSCRIPTIONS_URL : APP_STORE_SUBSCRIPTIONS_URL;
        if (native) {
          try {
            const { Browser } = await import("@capacitor/browser");
            await Browser.open({ url });
          } catch {
            window.open(url, "_blank");
          }
        } else {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        setBusy(false);
        return;
      }
      const res = await apiFetch("/api/billing-portal", { method: "POST" });
      if (!res.ok) throw new Error();
      const { url } = (await res.json()) as { url: string };
      window.location.href = url;
    } catch {
      setError("We couldn't open your subscription settings. Please try again.");
      setBusy(false);
    }
  }

  // Let an undecided visitor explore the fully populated shared demo account
  // before committing to a trial — the same one-tap entry the login page offers.
  // Web does a full navigation to the /demo route handler (cookie sign-in +
  // reseed + redirect to "/"); the bundled app has no such route and can't take
  // the cookie session, so it fetches the demo session tokens from
  // /api/demo-session and adopts them with setSession. Inert (errors gracefully)
  // wherever the demo credentials aren't configured.
  async function enterDemo() {
    setBusy(true);
    setError(null);
    if (!native) {
      window.location.assign("/demo");
      return;
    }
    try {
      const res = await apiFetch("/api/demo-session", { method: "POST" });
      if (!res.ok) throw new Error();
      const { access_token, refresh_token, expires_at } = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_at?: string;
      };
      const supabase = createBrowserSupabase();
      const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
      if (sessionError) throw new Error();
      // Stash the deadline for the expiry wall (no demo_expires_at cookie on the
      // capacitor origin). Kept outside the volnar* namespace the sign-out purge
      // clears, so the adopt → onAuthStateChange purge can't race it away.
      try { if (expires_at) localStorage.setItem("demo_expires_at", expires_at); } catch {}
      window.location.assign("/");
    } catch {
      setError("The demo account isn't available right now.");
      setBusy(false);
    }
  }

  const monthlyPrice = storePrices.monthly ?? formatPrice(PLAN_PRICES.monthly);
  const annualPrice = storePrices.annual ?? formatPrice(PLAN_PRICES.annual);

  // True when there is a prior subscription that no longer grants access — show a
  // "manage existing" affordance alongside the buy buttons. past_due gets the most
  // direct copy because the fix is to update the card, not to buy again.
  const lapsed = !!data?.status && data.status !== "trialing" && data.status !== "active";
  const manageLabel = data?.status === "past_due" ? "Update payment method" : "Manage existing subscription";

  const renewLocation = native ? "the App Store" : "your account";

  // Build marker for on-device debugging — shown only when NEXT_PUBLIC_SHOW_BUILD_SHA
  // is truthy (set it in .env.local for dev), so it never appears in release builds.
  const showBuildSha =
    process.env.NEXT_PUBLIC_SHOW_BUILD_SHA === "1" || process.env.NEXT_PUBLIC_SHOW_BUILD_SHA === "true";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose a plan"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(143,168,194,0.07), transparent 55%), radial-gradient(ellipse 70% 45% at 105% 105%, rgba(151,112,61,0.06), transparent 55%)",
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 40px) 24px calc(env(safe-area-inset-bottom, 0px) + 32px)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 420, margin: "auto 0" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, marginBottom: 22 }}>
          <VolnarLogo size={48} />
          <h1
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 28,
              fontWeight: 500,
              letterSpacing: "-0.02em",
              color: "var(--hero)",
              lineHeight: 1.1,
              textAlign: "center",
              fontVariationSettings: "'opsz' 32",
              margin: 0,
            }}
          >
            Full access to Volnar
          </h1>
          <p style={{ fontSize: 15, color: "var(--text-dim)", textAlign: "center", lineHeight: 1.5, maxWidth: 320, margin: 0 }}>
            Start with a {TRIAL_DAYS}-day free trial. Cancel anytime before it ends and you won&apos;t be charged.
          </p>
        </div>

        {/* Plan options — annual highlighted */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 18 }}>
          <PlanOption
            label="Annual"
            price={annualPrice}
            period="per year"
            note={`${ANNUAL_MONTHS_FREE} months free vs monthly`}
            highlight
            selected={selected === "annual"}
            onSelect={() => setSelected("annual")}
          />
          <PlanOption
            label="Monthly"
            price={monthlyPrice}
            period="per month"
            selected={selected === "monthly"}
            onSelect={() => setSelected("monthly")}
          />
        </div>

        {error && (
          <div
            style={{
              fontSize: 13,
              color: "var(--negative-text)",
              background: "var(--negative-soft)",
              border: "1px solid var(--negative-soft)",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 14,
              lineHeight: 1.5,
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={() => buy(selected)}
          disabled={busy}
          style={{
            width: "100%",
            padding: "15px 22px",
            borderRadius: 14,
            border: "none",
            background: "var(--accent)",
            color: "#fff",
            fontSize: 15,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.7 : 1,
            minHeight: 54,
          }}
        >
          {busy ? "One moment…" : `Start ${TRIAL_DAYS}-day free trial`}
        </button>

        {/* Try-before-you-buy: jump into the live demo account without committing */}
        <button
          onClick={enterDemo}
          disabled={busy}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            width: "100%",
            marginTop: 10,
            padding: "12px 18px",
            borderRadius: 12,
            border: "none",
            background: "none",
            color: "var(--accent-text)",
            fontSize: 15,
            fontWeight: 500,
            cursor: busy ? "default" : "pointer",
            fontFamily: "var(--font-sans)",
          }}
        >
          Explore the demo account first
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            style={{ width: 13, height: 13 }}
          >
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>

        {native && (
          <button
            onClick={restore}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 15,
              fontWeight: 500,
              cursor: busy ? "default" : "pointer",
            }}
          >
            Restore purchases
          </button>
        )}

        {lapsed && (
          <button
            onClick={manageExisting}
            disabled={busy}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "12px 18px",
              borderRadius: 12,
              border: "1px solid var(--border-strong)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: 15,
              fontWeight: 500,
              cursor: busy ? "default" : "pointer",
            }}
          >
            {manageLabel}
          </button>
        )}

        {/* Apple-required auto-renew disclosure + legal links, near the buy button */}
        <p
          style={{
            fontSize: 12,
            color: "var(--text-faint)",
            lineHeight: 1.6,
            textAlign: "center",
            marginTop: 16,
          }}
        >
          After the free trial, your subscription renews automatically at{" "}
          {selected === "annual" ? `${annualPrice} per year` : `${monthlyPrice} per month`} until cancelled.
          Manage or cancel anytime in {renewLocation}. Payment is charged at the end of the trial.
          <br />
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(e, TERMS_URL)}
            style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Terms
          </a>
          {"  ·  "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(e, PRIVACY_URL)}
            style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Privacy
          </a>
        </p>

        {showBuildSha && (
          <p
            style={{
              fontSize: 11,
              color: "var(--text-faint)",
              textAlign: "center",
              marginTop: 8,
              opacity: 0.65,
              fontFamily: "var(--font-sans)",
            }}
          >
            build {process.env.NEXT_PUBLIC_BUILD_SHA}
          </p>
        )}

        <div style={{ textAlign: "center", marginTop: 18 }}>
          <button
            onClick={signOut}
            style={{
              fontSize: 13,
              color: "var(--text-faint)",
              background: "none",
              border: "none",
              cursor: "pointer",
              textDecoration: "underline",
              textUnderlineOffset: 3,
              fontFamily: "var(--font-sans)",
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanOption({
  label,
  price,
  period,
  note,
  highlight = false,
  selected,
  onSelect,
}: {
  label: string;
  price: string;
  period: string;
  note?: string;
  highlight?: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      aria-pressed={selected}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "16px 18px",
        borderRadius: 14,
        border: `1.5px solid ${selected ? "var(--accent)" : "var(--border)"}`,
        background: selected ? "var(--accent-soft)" : "var(--surface)",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 18,
          height: 18,
          flexShrink: 0,
          borderRadius: "50%",
          border: `2px solid ${selected ? "var(--accent)" : "var(--border-strong)"}`,
          background: selected ? "var(--accent)" : "transparent",
          boxShadow: selected ? "inset 0 0 0 3px var(--surface)" : "none",
        }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 17,
              fontWeight: 500,
              color: "var(--text)",
              fontVariationSettings: "'opsz' 18",
            }}
          >
            {label}
          </span>
          {highlight && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--accent-text)",
                background: "var(--surface)",
                border: "1px solid var(--accent)",
                borderRadius: 999,
                padding: "2px 8px",
              }}
            >
              Best value
            </span>
          )}
        </span>
        {note && (
          <span style={{ display: "block", fontSize: 13, color: "var(--text-dim)", marginTop: 3 }}>
            {note}
          </span>
        )}
      </span>
      <span style={{ textAlign: "right", flexShrink: 0 }}>
        <span style={{ display: "block", fontSize: 16, fontWeight: 600, color: "var(--text)" }}>{price}</span>
        <span style={{ display: "block", fontSize: 12, color: "var(--text-faint)" }}>{period}</span>
      </span>
    </button>
  );
}
