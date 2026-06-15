"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { VolnarLogo } from "@/components/VolnarLogo";
import { useUserContext } from "@/components/UserProvider";
import { useSubscription } from "@/components/SubscriptionProvider";

// Calm, reassuring steps shown while the app boots, so the wait reads as
// intentional progress rather than a hang. Banker's tone — no emojis.
const STEPS = [
  "Securing your session",
  "Loading your portfolio",
  "Preparing your overview",
];

const STEP_INTERVAL_MS = 1800;

// Covers the app during the indeterminate auth/subscription windows so the main
// surfaces never flash before the access decision is made:
//   - cold start / just after login, while we resolve who the user is and whether
//     they are entitled — otherwise the app shows for a beat before the Paywall;
//   - sign-out, while the session is cleared and the redirect to /login is in
//     flight — otherwise the main screen lingers for a few seconds.
// Public surfaces (login, marketing) are never covered. Once the state resolves
// this renders nothing: an entitled user sees the app, a non-entitled one the
// Paywall (which decides on the same resolved state, so the two never overlap).
// Rather than a bare logo, it shows a pulsing mark, a heading and a rotating
// status line with a waiting indicator, so the user knows the app is loading and
// what to expect.
export function AppGate() {
  const pathname = usePathname();
  const { user, loading: userLoading, signingOut } = useUserContext();
  const { loading: subLoading } = useSubscription();

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/marketing");

  // Hold the cover on a protected surface until we both know the user and have
  // their entitlement: auth still resolving, a sign-out in flight, signed out
  // (redirect pending), or signed in with the subscription status not yet loaded.
  const covering = !isPublic && (signingOut || userLoading || !user || subLoading);

  // Advance through the steps while covering, clamping on the last so a longer
  // wait settles on "Preparing your overview" rather than looping.
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!covering) return;
    const id = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      STEP_INTERVAL_MS,
    );
    return () => clearInterval(id);
  }, [covering]);

  if (!covering) return null;

  // On sign-out the wait is about leaving, not booting.
  const heading = signingOut ? "Signing you out" : "Getting things ready";
  const status = signingOut ? "Clearing your session" : STEPS[step];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={status}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 24,
        padding: 24,
        textAlign: "center",
      }}
    >
      <VolnarLogo size={52} className="logo-pulse" />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7 }}>
        <div
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: 19,
            fontWeight: 500,
            color: "var(--text)",
            fontVariationSettings: "'opsz' 20",
          }}
        >
          {heading}
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: "var(--text-dim)",
            lineHeight: 1.5,
            minHeight: 20,
          }}
        >
          {status}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6 }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="loading-dot"
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: "var(--accent)",
              opacity: 0.5,
              animationDelay: `${i * 0.18}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
