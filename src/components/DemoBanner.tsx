"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSubscription } from "@/components/SubscriptionProvider";
import { useSignOut } from "@/lib/hooks";
import { readDemoExpiry } from "@/components/DemoExpiryWall";
import { DEMO_EXPIRED_EVENT } from "@/lib/api";

// "47:12 left" from a remaining-ms count — minutes:seconds, zero-padded seconds.
function fmtCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")} left`;
}

// Accent-tinted banner shown only on the shared demo account (entitlement
// product_id "demo", surfaced server-side as SubscriptionView.isDemo). Subscribe
// signs out of the shared demo and lands on /login, where a visitor creates their
// own account and subscribes through the in-app StoreKit/RevenueCat paywall. This
// is the only action, on web and native alike: no external URL or web checkout is
// ever opened on native (App Store Guideline 3.1.1) — signOut is the whole action.
// Always visible on the demo account — no dismiss — and rendered nowhere else.
// Sits below the BottomNav (--z-banner 20 < z-30) and clears it on mobile; skipped
// on the mobile chat route so it never covers the composer.
export function DemoBanner() {
  const { data } = useSubscription();
  const pathname = usePathname();
  const signOut = useSignOut();
  const isDemo = !!data?.isDemo;

  // Live trial countdown from the session deadline (per-visitor demo). null when
  // there's no deadline (shared demo / production) — the pill then shows as before.
  // Computed after mount so it's hydration-safe. At zero, fire the expiry event so
  // DemoExpiryWall takes over at once (which ends the session and resets the data).
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (!isDemo) return;
    const update = () => {
      const deadline = readDemoExpiry();
      if (deadline == null) { setRemainingMs(null); return; }
      const rem = deadline - Date.now();
      setRemainingMs(Math.max(0, rem));
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.dispatchEvent(new Event(DEMO_EXPIRED_EVENT));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isDemo]);

  if (!isDemo) return null;
  // The mobile chat composer sits where this banner would — skip it there. Also skip
  // the login page, which a demo session can now reach (to sign in as themselves).
  if (pathname === "/chat" || pathname.startsWith("/login")) return null;

  return (
    <>
      <style>{`
        .demo-banner { bottom: calc(env(safe-area-inset-bottom, 0px) + 68px); }
        @media (min-width: 768px) { .demo-banner { bottom: 16px; } }
        .demo-banner-link { text-decoration: none; }
        .demo-banner-link:hover { text-decoration: underline; }
      `}</style>
      <div
        className="demo-banner"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          // Token scale: above page content, below the fixed BottomNav (z-30).
          zIndex: "var(--z-banner)",
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          padding: "var(--space-2) var(--space-5)",
          borderRadius: "var(--radius-pill)",
          // Opaque accent tint (accent-soft flattened onto the surface) — the
          // pill floats over list rows, so a translucent wash would let the
          // text underneath bleed through it.
          background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
          border: "0.5px solid var(--accent)",
          boxShadow: "var(--shadow-soft)",
          fontFamily: "var(--font-ui)",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-body)",
            fontWeight: 500,
            color: "var(--accent)",
          }}
        >
          Demo account{" "}
          {remainingMs != null ? (
            <span className="tnum" style={{ color: "var(--accent)", fontSize: "var(--fs-meta)" }}>
              · {fmtCountdown(remainingMs)}
            </span>
          ) : (
            <span style={{ color: "var(--text-dim)" }}>· sample data</span>
          )}
        </span>
        <span
          aria-hidden="true"
          style={{ width: "0.5px", height: 15, background: "var(--accent)", opacity: 0.4 }}
        />
        <button
          type="button"
          className="demo-banner-link"
          onClick={signOut}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "var(--fs-body)",
            fontWeight: 500,
            color: "var(--accent)",
            background: "none",
            border: "none",
            // Grow the tap target without growing the pill (negative margins
            // cancel the padding in layout).
            padding: "var(--space-3) var(--space-2)",
            margin: "calc(var(--space-3) * -1) calc(var(--space-2) * -1)",
            cursor: "pointer",
          }}
        >
          Subscribe
        </button>
      </div>
    </>
  );
}
