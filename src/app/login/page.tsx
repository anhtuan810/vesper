"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { isNative } from "@/lib/platform";
import { apiFetch } from "@/lib/api";
import { purgeClientCaches } from "@/lib/client-cache";
import { signInWithGoogleNative, signInWithAppleNative } from "@/lib/native/auth-native";
import { VolnarLogo } from "@/components/VolnarLogo";

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
    window.open(url, "_blank");
  }
}

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [error, setError] = useState<string | null>(
    params.get("error") === "native_auth_failed"
      ? "Sign-in didn't complete. Please try again."
      : null
  );
  // Entering the demo runs a server-side reseed (signInWithPassword +
  // seedDemoUser) that can take several seconds before the Portfolio loads. Hold
  // a full-screen "preparing" cover over that gap so the click isn't met with a
  // frozen login page. Stays up through the redirect; only cleared on error.
  const [preparingDemo, setPreparingDemo] = useState(false);
  const supabase = createBrowserSupabase();

  // Render-time native check must wait for mount: isNative() reads the
  // Capacitor bridge, which doesn't exist during SSR, and a direct call in
  // render would mismatch hydration.
  const [native, setNative] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setNative(isNative()); }, []);

  const callbackUrl = (typeof window !== "undefined")
    ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  async function signInWithGoogle() {
    setError(null);
    if (isNative()) {
      try {
        await signInWithGoogleNative(supabase, next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Sign-in failed");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        // Always show Google's account chooser. Without this, Google silently
        // reuses the last-used account (e.g. a since-deleted one), giving no way
        // to pick a different account on a device with several signed in.
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) setError(error.message);
  }

  async function signInWithApple() {
    setError(null);
    if (isNative()) {
      try {
        await signInWithAppleNative(supabase);
        // SPA navigation — a full page load of a non-root path would be
        // served the root index.html in the bundled app.
        router.replace(next);
      } catch (e) {
        // ASAuthorizationError 1001 = user dismissed the Apple sheet; per HIG
        // a cancel is silent, not an error state.
        const msg = e instanceof Error ? e.message : "";
        if (msg.includes("1001")) return;
        setError(msg || "Sign-in failed");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "apple",
      options: { redirectTo: callbackUrl },
    });
    if (error) setError(error.message);
  }

  const oauthButtonStyle: React.CSSProperties = {
    padding: "16px 24px",
    borderRadius: "var(--radius-lg)",
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
    fontSize: "var(--fs-subhead)",
    fontWeight: 500,
    cursor: "pointer",
    minHeight: 54,
    boxShadow: "var(--shadow-soft)",
  };

  // Demo entry as a full-width featured button (previously a small text link) so
  // launch visitors can jump into the live demo without signing in. Accent-tinted
  // to read as an invitation while staying visually distinct from the white
  // sign-in buttons; fills solid on hover (see the .demo-cta rule below).
  const demoButtonStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: "100%",
    padding: "16px 24px",
    borderRadius: "var(--radius-lg)",
    background: "var(--accent-soft)",
    border: "1px solid var(--accent)",
    color: "var(--accent-text)",
    fontSize: "var(--fs-subhead)",
    fontWeight: 600,
    cursor: "pointer",
    minHeight: 54,
    textDecoration: "none",
  };

  if (preparingDemo) {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label="Preparing your demo account"
        className="min-h-dvh"
        style={{
          background: "var(--bg)",
          backgroundImage:
            "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(143,168,194,0.07), transparent 55%), radial-gradient(ellipse 70% 45% at 105% 105%, rgba(151,112,61,0.06), transparent 55%)",
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
        <div style={{ fontSize: "var(--fs-meta)", color: "var(--text-dim)", lineHeight: "var(--lh-body)", minHeight: 20 }}>
          Preparing your demo account…
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

  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(143,168,194,0.07), transparent 55%), radial-gradient(ellipse 70% 45% at 105% 105%, rgba(151,112,61,0.06), transparent 55%)",
        padding: "clamp(24px,6vw,56px) 24px",
      }}
    >
      <div className="w-full" style={{ maxWidth: 408 }}>
        <div className="text-center" style={{ marginBottom: 28 }}>
          <div className="flex flex-col items-center" style={{ gap: 18, marginBottom: 22 }}>
            <VolnarLogo size={56} />
            <span
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 500, fontSize: 30,
                letterSpacing: "var(--tracking-hero)", lineHeight: 1,
                fontVariationSettings: "'opsz' 32",
                color: "var(--hero)",
              }}
            >
              Volnar
            </span>
          </div>
          <h1
            className="font-display text-hero mx-auto"
            style={{ fontSize: "clamp(26px,7vw,32px)", fontWeight: 500, lineHeight: 1.12, letterSpacing: "var(--tracking-hero)", fontVariationSettings: "'opsz' 36", maxWidth: 340 }}
          >
            Quiet confidence{" "}
            <span className="italic font-normal text-dim">over your portfolio.</span>
          </h1>
        </div>

        <div className="space-y-2.5">
          <button
            onClick={signInWithApple}
            className="w-full flex items-center justify-center gap-2.5 transition-colors hover:bg-surface-elev"
            style={oauthButtonStyle}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
            </svg>
            Continue with Apple
          </button>

          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2.5 transition-colors hover:bg-surface-elev"
            style={oauthButtonStyle}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {error && (
            <div
              className="font-numeric"
              style={{
                fontSize: "var(--fs-caption)", color: "var(--negative)",
                padding: "10px 14px", borderRadius: "var(--radius-md)",
                background: "var(--negative-soft)",
                border: "1px solid var(--negative)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <style>{`
          .demo-cta { transition: background-color .15s ease, color .15s ease, border-color .15s ease; }
          .demo-cta:hover { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
        `}</style>

        <div className="flex items-center" style={{ gap: 12, margin: "20px 0 14px" }}>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span className="eyebrow">or</span>
          <span style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <a
          href="/demo"
          onClick={async (e) => {
            e.preventDefault();
            setError(null);
            setPreparingDemo(true);
            if (!native) {
              // Web: hand off to the server /demo route, which signs in and
              // reseeds before redirecting to "/". The cover stays painted
              // until the browser swaps documents.
              window.location.assign("/demo");
              return;
            }
            // Native: /demo (cookie sign-in) doesn't exist in the bundled
            // app — fetch the demo session tokens and adopt them instead.
            try {
              const res = await apiFetch("/api/demo-session", { method: "POST" });
              if (!res.ok) throw new Error();
              const { access_token, refresh_token, expires_at } = await res.json();
              const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
              if (sessionError) throw new Error();
              // Purge any chat/figure caches a PREVIOUS demo session left in this
              // browser. The shared-account demo reuses one user id across entries,
              // so adopting the session fires no id-change in onAuthStateChange and
              // its purge never runs — a stale conversation would otherwise survive
              // the server-side reseed (the web path handles this via the
              // pre-hydration script in layout.tsx). Runs BEFORE demo_expires_at is
              // written below, which lives outside the purged namespaces.
              purgeClientCaches();
              // Native has no demo_expires_at cookie (cookies don't cross the
              // capacitor origin) — stash the deadline for the expiry wall. Kept
              // outside the volnar* namespace the sign-out purge clears, so the
              // adopt → onAuthStateChange purge can't race it away; it's overwritten
              // on the next demo entry and only ever read when isDemo holds.
              try { if (expires_at) localStorage.setItem("demo_expires_at", expires_at); } catch {}
              window.location.assign("/");
            } catch {
              setPreparingDemo(false);
              setError("The demo account isn't available right now.");
            }
          }}
          className="demo-cta"
          style={demoButtonStyle}
        >
          Explore a live demo account
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}>
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </a>

        <p
          className="text-center font-numeric text-faint mt-10"
          style={{ fontSize: "var(--fs-micro)", letterSpacing: "0.04em", lineHeight: "var(--lh-body)" }}
        >
          By continuing you agree to our{" "}
          <a
            href={TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(e, TERMS_URL)}
            style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => openExternal(e, PRIVACY_URL)}
            style={{ color: "var(--text-dim)", textDecoration: "underline", textUnderlineOffset: 2 }}
          >
            Privacy Policy
          </a>.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
