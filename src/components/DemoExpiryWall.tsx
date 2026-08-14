"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { VolnarLogo } from "@/components/VolnarLogo";
import { useSubscription } from "@/components/SubscriptionProvider";
import { useSignOut } from "@/lib/hooks";
import { DEMO_EXPIRED_EVENT } from "@/lib/api";

// Reads the demo session deadline written at entry: a readable cookie on web
// (set by the /demo route), and localStorage on native (cookies don't cross the
// capacitor://localhost origin — set when the session tokens are adopted). Both
// hold an ISO timestamp under the same name. Returns the deadline in ms, or null.
export function readDemoExpiry(): number | null {
  if (typeof document !== "undefined") {
    const m = document.cookie.match(/(?:^|;\s*)demo_expires_at=([^;]+)/);
    if (m) {
      const t = Date.parse(decodeURIComponent(m[1]));
      if (!Number.isNaN(t)) return t;
    }
  }
  try {
    const v = localStorage.getItem("demo_expires_at");
    if (v) {
      const t = Date.parse(v);
      if (!Number.isNaN(t)) return t;
    }
  } catch {}
  return null;
}

// The wall for an ended demo session. Shows only on a demo account (the isDemo
// entitlement signal) once its window is up — detected either when a demo API call
// returns demoExpired (DEMO_EXPIRED_EVENT) or when the local clock passes the
// stored deadline on mount/interval. The single action signs out of the anonymous
// session; the visitor lands on /login to create a real account, where the
// platform-correct paywall (Stripe on web, StoreKit on native — never an external
// URL) presents the 7-day free trial. Demo data does not carry over.
export function DemoExpiryWall() {
  const { data } = useSubscription();
  const signOut = useSignOut();
  const isDemo = !!data?.isDemo;

  // Seed from the stored deadline so a session resumed after its window walls at
  // once; the render still gates on isDemo, so a stale value can't show anything.
  const [expired, setExpired] = useState<boolean>(() => {
    const deadline = readDemoExpiry();
    return deadline != null && Date.now() >= deadline;
  });

  // setExpired is only ever called from async callbacks (interval tick / the
  // demoExpired event) — never synchronously in the effect body.
  useEffect(() => {
    if (!isDemo) return;
    const tick = () => {
      const deadline = readDemoExpiry();
      if (deadline != null && Date.now() >= deadline) setExpired(true);
    };
    const interval = setInterval(tick, 20_000);
    const onExpiredEvent = () => setExpired(true);
    window.addEventListener(DEMO_EXPIRED_EVENT, onExpiredEvent);
    return () => {
      clearInterval(interval);
      window.removeEventListener(DEMO_EXPIRED_EVENT, onExpiredEvent);
    };
  }, [isDemo]);

  if (!isDemo || !expired) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Demo session ended"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-expiry-wall)",
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(ellipse 90% 55% at 18% -5%, color-mix(in srgb, var(--cat-property) 7%, transparent), transparent 55%), radial-gradient(ellipse 70% 45% at 105% 105%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 55%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "var(--space-6)",
        padding:
          "calc(env(safe-area-inset-top, 0px) + 40px) 24px calc(env(safe-area-inset-bottom, 0px) + 32px)",
        textAlign: "center",
        fontFamily: "var(--font-ui)",
      }}
    >
      <VolnarLogo size={48} />
      <p
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-title)",
          fontWeight: 500,
          color: "var(--hero)",
          lineHeight: "var(--lh-snug)",
          letterSpacing: "var(--tracking-title)",
          fontVariationSettings: "'opsz' 20",
          maxWidth: 340,
          margin: 0,
        }}
      >
        Your demo session has ended. Create an account to continue, with 7 days free.
      </p>
      <button
        // Demo funnel. This wall only renders when isDemo, so the event can
        // only come from the demo path.
        onClick={() => { track("demo_signup_click", { placement: "expiry_wall" }); signOut(); }}
        style={{
          padding: "var(--space-4) var(--space-5)",
          borderRadius: "var(--radius-lg)",
          border: "none",
          background: "var(--accent)",
          color: "var(--bg)",
          fontSize: "var(--fs-body)",
          fontWeight: 600,
          cursor: "pointer",
          minHeight: 52,
          minWidth: 220,
          fontFamily: "var(--font-ui)",
        }}
      >
        Create a free account
      </button>
    </div>
  );
}
