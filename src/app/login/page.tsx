"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { isNative } from "@/lib/platform";
import { apiFetch } from "@/lib/api";
import { signInWithGoogleNative, signInWithAppleNative } from "@/lib/native/auth-native";
import { VolnarLogo } from "@/components/VolnarLogo";

function LoginInner() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [error, setError] = useState<string | null>(
    params.get("error") === "native_auth_failed"
      ? "Sign-in didn't complete. Please try again."
      : null
  );
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
    padding: "15px 22px",
    borderRadius: 14,
    background: "var(--surface)",
    border: "1px solid var(--border-strong)",
    color: "var(--text)",
    fontSize: 14.5,
    fontWeight: 500,
    cursor: "pointer",
    minHeight: 54,
    boxShadow: "0 1px 2px rgba(26,24,22,0.04)",
  };

  return (
    <div
      className="min-h-dvh flex items-center justify-center"
      style={{
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(ellipse 90% 55% at 18% -5%, rgba(94,124,166,0.07), transparent 55%), radial-gradient(ellipse 70% 45% at 105% 105%, rgba(46,110,96,0.06), transparent 55%)",
        padding: "clamp(24px,6vw,56px) 24px",
      }}
    >
      <div className="w-full" style={{ maxWidth: 408 }}>
        <div className="text-center" style={{ marginBottom: 28 }}>
          <div className="flex flex-col items-center" style={{ gap: 18, marginBottom: 22 }}>
            <VolnarLogo size={56} />
            <span
              style={{
                fontFamily: "var(--serif)",
                fontWeight: 500, fontSize: 30,
                letterSpacing: "-0.02em", lineHeight: 1,
                fontVariationSettings: "'opsz' 32",
                color: "var(--hero)",
              }}
            >
              Volnar
            </span>
          </div>
          <h1
            className="font-serif text-hero mx-auto"
            style={{ fontSize: "clamp(26px,7vw,32px)", fontWeight: 500, lineHeight: 1.12, letterSpacing: "-0.02em", fontVariationSettings: "'opsz' 36", maxWidth: 340 }}
          >
            Quiet confidence{" "}
            <span className="italic font-normal text-dim">over your portfolio.</span>
          </h1>

          <div
            className="mx-auto mt-7 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
            style={{ maxWidth: 360, boxShadow: "0 1px 2px rgba(26,24,22,0.04), 0 18px 40px -20px rgba(26,24,22,0.18)" }}
          >
            {/* Meta row */}
            <div className="flex items-center gap-1.5 px-4 pt-4 pb-2.5 text-[10.5px] font-medium uppercase tracking-[0.05em] text-[var(--text-dim)]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
              Live · today
            </div>

            {/* Asset class rows */}
            <div className="flex flex-col gap-2 px-4 pb-3">
              {[
                {
                  name: "Property",
                  change: "−0.3%",
                  tone: "down" as const,
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 10l9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2V10z" />
                    </svg>
                  ),
                },
                {
                  name: "Public markets",
                  change: "+1.8%",
                  tone: "up" as const,
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 17 9 11 13 15 21 7" />
                      <polyline points="15 7 21 7 21 13" />
                    </svg>
                  ),
                },
                {
                  name: "Reserves",
                  change: "0.0%",
                  tone: "flat" as const,
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="3" y="6" width="18" height="13" rx="2" />
                      <path d="M3 10h18" />
                    </svg>
                  ),
                },
                {
                  name: "Crypto",
                  change: "+2.8%",
                  tone: "up" as const,
                  icon: (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polygon points="12 3 21 8 21 16 12 21 3 16 3 8" />
                    </svg>
                  ),
                },
              ].map((row) => (
                <div key={row.name} className="flex items-center gap-2.5">
                  <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-[var(--surface-elev)] text-[var(--text-dim)]">
                    {row.icon}
                  </div>
                  <div className="flex-1 text-[13px] font-medium text-[var(--text)] text-left">{row.name}</div>
                  <div
                    className={`text-[13px] font-semibold tabular-nums tracking-tight ${
                      row.tone === "up"
                        ? "text-[var(--accent)]"
                        : row.tone === "down"
                        ? "text-[var(--negative-text)]"
                        : "text-[var(--text-dim)]"
                    }`}
                  >
                    {row.change}
                  </div>
                </div>
              ))}
            </div>

            {/* Worth knowing band */}
            <div className="border-t border-[var(--border)] bg-[var(--surface-elev)] px-4 py-3 text-left">
              <div className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.05em] text-[var(--text-dim)]">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" aria-hidden="true" />
                Worth knowing
              </div>
              <p className="m-0 font-serif text-[13px] italic leading-snug text-[var(--text-dim)]">
                <strong className="font-semibold not-italic text-[var(--text)]">NVIDIA reports tonight</strong>. It&apos;s your largest holding — the AI-chip read-through everyone&apos;s watching.
              </p>
            </div>
          </div>

          <p className="mx-auto mt-5 max-w-[330px] text-center text-[13px] leading-snug text-[var(--text-dim)]">
            Every asset. Every market event.{" "}
            <strong className="font-medium text-[var(--text)]">Every reason why.</strong>
          </p>
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
              className="font-mono"
              style={{
                fontSize: 11, color: "var(--negative)",
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(201,122,110,0.08)",
                border: "1px solid rgba(201,122,110,0.18)",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div className="text-center mt-7">
          <a
            href="/demo"
            onClick={async (e) => {
              // Native: /demo (cookie sign-in) doesn't exist in the bundled
              // app — fetch the demo session tokens and adopt them instead.
              if (!native) return;
              e.preventDefault();
              setError(null);
              try {
                const res = await apiFetch("/api/demo-session", { method: "POST" });
                if (!res.ok) throw new Error();
                const { access_token, refresh_token } = await res.json();
                const { error: sessionError } = await supabase.auth.setSession({ access_token, refresh_token });
                if (sessionError) throw new Error();
                window.location.assign("/");
              } catch {
                setError("The demo account isn't available right now.");
              }
            }}
            className="inline-flex items-center gap-1.5 text-dim transition-colors hover:text-fg"
            style={{ fontSize: 13, textDecoration: "none" }}
          >
            Explore a live demo account
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </a>
        </div>

        <p
          className="text-center font-mono text-faint mt-10"
          style={{ fontSize: 10, letterSpacing: "0.04em", lineHeight: 1.6 }}
        >
          By continuing you agree to our Terms and Privacy Policy.
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
