"use client";

import { usePathname } from "next/navigation";
import { useSubscription } from "@/components/SubscriptionProvider";
import { useSignOut } from "@/lib/hooks";

// Accent-tinted banner shown only on the shared demo account (entitlement
// product_id "demo", surfaced server-side as SubscriptionView.isDemo). Subscribe
// signs out of the shared demo and lands on /login, where a visitor creates their
// own account and subscribes through the in-app StoreKit/RevenueCat paywall. This
// is the only action, on web and native alike: no external URL or web checkout is
// ever opened on native (App Store Guideline 3.1.1) — signOut is the whole action.
// Always visible on the demo account — no dismiss — and rendered nowhere else.
// Sits below the BottomNav (z-25 < z-30) and clears it on mobile; skipped on the
// mobile chat route so it never covers the composer.
export function DemoBanner() {
  const { data } = useSubscription();
  const pathname = usePathname();
  const signOut = useSignOut();

  if (!data?.isDemo) return null;
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
          zIndex: 25,
          pointerEvents: "auto",
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "9px 18px",
          borderRadius: 999,
          background: "var(--accent-soft)",
          border: "0.5px solid var(--accent)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 14,
            color: "var(--accent)",
            fontVariationSettings: "'opsz' 14",
          }}
        >
          Demo account{" "}
          <span style={{ color: "var(--text-dim)" }}>· sample data</span>
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
            fontFamily: "var(--font-sans)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--accent)",
            background: "none",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          Subscribe
        </button>
      </div>
    </>
  );
}
