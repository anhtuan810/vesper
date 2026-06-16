"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useSubscription } from "@/components/SubscriptionProvider";
import { useSignOut } from "@/lib/hooks";
import { isNative } from "@/lib/platform";

// Quiet banner shown only on the shared demo account (entitlement product_id
// "demo", surfaced server-side as SubscriptionView.isDemo). On web a Subscribe
// action signs out of the shared demo and goes to the login page, where a visitor
// creates their own account and subscribes through the paywall; on native it is
// just a notice. Always visible on the demo account — no dismiss — and rendered
// nowhere else. Sits below the BottomNav (z-25 < z-30) and clears it on mobile;
// skipped on the mobile chat route so it never covers the composer.
export function DemoBanner() {
  const { data } = useSubscription();
  const pathname = usePathname();
  const signOut = useSignOut();

  // Resolve the platform in an effect (mirrors Paywall) so server/web render and
  // device hydration agree on whether the Subscribe link appears.
  const [native, setNative] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setNative(isNative()), []);

  if (!data?.isDemo) return null;
  // The mobile chat composer sits where this pill would — skip it there. Also skip
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
          gap: 10,
          padding: "7px 16px",
          borderRadius: 999,
          background: "var(--nav-surface)",
          backdropFilter: "saturate(180%) blur(20px)",
          WebkitBackdropFilter: "saturate(180%) blur(20px)",
          border: "0.5px solid var(--border)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
          fontFamily: "var(--font-sans)",
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 13,
            color: "var(--text-dim)",
            fontVariationSettings: "'opsz' 14",
          }}
        >
          Demo account
        </span>
        {!native && (
          <>
            <span
              aria-hidden="true"
              style={{ width: "0.5px", height: 14, background: "var(--border)" }}
            />
            <button
              type="button"
              className="demo-banner-link"
              onClick={signOut}
              style={{
                fontFamily: "var(--font-sans)",
                fontSize: 13,
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
          </>
        )}
      </div>
    </>
  );
}
