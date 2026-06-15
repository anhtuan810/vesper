"use client";

import { usePathname } from "next/navigation";
import { VolnarLogo } from "@/components/VolnarLogo";
import { useUserContext } from "@/components/UserProvider";
import { useSubscription } from "@/components/SubscriptionProvider";

// Covers the app during the indeterminate auth/subscription windows so the main
// surfaces never flash before the access decision is made:
//   - cold start / just after login, while we resolve who the user is and whether
//     they are entitled — otherwise the app shows for a beat before the Paywall;
//   - sign-out, while the session is cleared and the redirect to /login is in
//     flight — otherwise the main screen lingers for a few seconds.
// Public surfaces (login, marketing) are never covered. Once the state resolves
// this renders nothing: an entitled user sees the app, a non-entitled one the
// Paywall (which decides on the same resolved state, so the two never overlap).
export function AppGate() {
  const pathname = usePathname();
  const { user, loading: userLoading, signingOut } = useUserContext();
  const { loading: subLoading } = useSubscription();

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/marketing");

  // Hold the cover on a protected surface until we both know the user and have
  // their entitlement: auth still resolving, a sign-out in flight, signed out
  // (redirect pending), or signed in with the subscription status not yet loaded.
  const covering = !isPublic && (signingOut || userLoading || !user || subLoading);
  if (!covering) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <VolnarLogo size={48} />
    </div>
  );
}
