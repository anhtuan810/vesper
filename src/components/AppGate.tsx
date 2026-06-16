"use client";

import { usePathname } from "next/navigation";
import { VolnarLogo } from "@/components/VolnarLogo";
import { useUserContext } from "@/components/UserProvider";

// Full-screen cover that keeps protected surfaces from showing to someone who is
// not signed in, and bridges the brief sign-out transition before the redirect to
// /login. It is NOT a loading screen: a signed-in user is never covered, so normal
// data loading on the app surfaces (the subscription read, portfolio fetches, etc.)
// is unaffected and never flashes this page. Public surfaces (login, marketing)
// are never covered.
export function AppGate() {
  const pathname = usePathname();
  const { user, loading: userLoading, signingOut } = useUserContext();

  const isPublic = pathname.startsWith("/login") || pathname.startsWith("/marketing");

  // Cover only when there is no signed-in user to show the page to (auth has
  // resolved and nobody is signed in) or while a sign-out is in flight. We do NOT
  // cover during the initial auth resolution (userLoading), so a returning
  // signed-in user goes straight to their app without a splash; the web middleware
  // already redirects an unauthenticated visitor server-side before the page
  // renders, and the native build's login wall handles the same client-side.
  const covering = !isPublic && (signingOut || (!userLoading && !user));
  if (!covering) return null;

  const message = signingOut ? "Signing you out" : "Taking you to sign in";

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={message}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        padding: 24,
        textAlign: "center",
      }}
    >
      <VolnarLogo size={52} className="logo-pulse" />
      <div style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.5, minHeight: 20 }}>
        {message}
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
