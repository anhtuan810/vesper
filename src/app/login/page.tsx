"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";

function LoginInner() {
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = createBrowserSupabase();

  const callbackUrl = (typeof window !== "undefined")
    ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
    : undefined;

  async function signInWithGoogle() {
    setError(null);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callbackUrl },
    });
    if (error) setError(error.message);
  }

  async function signInWithEmail() {
    if (!email) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callbackUrl },
    });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setEmailSent(true);
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{
        background: "var(--bg)",
        backgroundImage:
          "radial-gradient(ellipse 80% 50% at 20% 0%, rgba(212,165,116,0.05), transparent 50%), radial-gradient(ellipse 60% 40% at 100% 100%, rgba(107,170,117,0.03), transparent 50%)",
      }}
    >
      <div className="w-full" style={{ maxWidth: 360 }}>
        <div className="text-center mb-12">
          <div
            className="mx-auto flex items-center justify-center mb-5"
            style={{
              width: 56, height: 56, borderRadius: 14,
              background: "var(--accent-soft)",
              border: "1px solid rgba(212,165,116,0.18)",
              position: "relative",
            }}
          >
            <span
              className="font-serif text-accent"
              style={{ fontSize: 28, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
            >
              V
            </span>
            <span
              style={{
                position: "absolute", top: 10, right: 10,
                width: 4, height: 4, borderRadius: "50%",
                background: "var(--accent)", boxShadow: "0 0 6px var(--accent)",
              }}
            />
          </div>
          <h1
            className="font-serif text-fg"
            style={{
              fontSize: 32, fontWeight: 300, letterSpacing: "-0.025em",
              fontVariationSettings: "'opsz' 144", lineHeight: 1.1, marginBottom: 8,
            }}
          >
            Volnar
          </h1>
          <p
            className="font-serif italic text-dim"
            style={{ fontSize: 14, lineHeight: 1.5, fontVariationSettings: "'opsz' 144" }}
          >
            Quiet confidence over your portfolio.
          </p>
        </div>

        <div className="space-y-2">
          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-2.5 transition-colors hover:bg-surface-elev"
            style={{
              padding: "12px 20px", borderRadius: 12,
              background: "var(--surface)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
              fontSize: 13, fontWeight: 500,
              cursor: "pointer",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 my-3">
            <div className="flex-1" style={{ height: 1, background: "var(--border)" }} />
            <span
              className="font-mono uppercase text-faint"
              style={{ fontSize: 9, letterSpacing: "0.18em" }}
            >
              or
            </span>
            <div className="flex-1" style={{ height: 1, background: "var(--border)" }} />
          </div>

          {!emailSent ? (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signInWithEmail()}
                placeholder="your@email.com"
                disabled={loading}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  background: "var(--surface)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text)",
                  fontSize: 13, outline: "none", boxSizing: "border-box",
                  fontFamily: "var(--sans)",
                }}
              />
              <button
                onClick={signInWithEmail}
                disabled={loading || !email}
                className="w-full transition-opacity"
                style={{
                  padding: "12px 20px", borderRadius: 12, border: "none",
                  background: loading || !email ? "var(--surface-elev)" : "var(--accent)",
                  color: loading || !email ? "var(--text-faint)" : "var(--bg)",
                  fontSize: 13, fontWeight: 600, fontFamily: "var(--mono)",
                  letterSpacing: "0.04em",
                  cursor: loading || !email ? "default" : "pointer",
                  opacity: loading || !email ? 0.6 : 1,
                }}
              >
                {loading ? "Sending…" : "Continue with email"}
              </button>
            </>
          ) : (
            <div
              style={{
                padding: "14px 18px", borderRadius: 12,
                background: "var(--accent-soft)",
                border: "1px solid rgba(212,165,116,0.18)",
                color: "var(--accent)",
                fontSize: 12, lineHeight: 1.55,
              }}
            >
              Check your email for a sign-in link. You can close this tab.
            </div>
          )}

          {error && (
            <div
              className="font-mono"
              style={{
                fontSize: 11, color: "var(--negative)",
                padding: "8px 12px", borderRadius: 8,
                background: "rgba(201,122,110,0.08)",
                border: "1px solid rgba(201,122,110,0.18)",
              }}
            >
              {error}
            </div>
          )}
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
