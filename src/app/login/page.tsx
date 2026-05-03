"use client";

import { createBrowserSupabase } from "@/lib/supabase";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const supabase = createBrowserSupabase();

  async function signInWithGoogle() {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function signInWithEmail() {
    if (!email) return;
    setLoading(true);
    await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setEmailSent(true);
    setLoading(false);
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#F8F7F4",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        rel="stylesheet"
      />

      <div style={{ width: 360, textAlign: "center" }}>
        {/* Logo */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14, background: "#2563EB",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 16,
          }}>V</div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em", color: "#0F0E0C", margin: 0 }}>
            Vesper
          </h1>
          <p style={{ fontSize: 14, color: "#9CA3AF", marginTop: 8, lineHeight: 1.6 }}>
            Your financial picture, always clear.
          </p>
        </div>

        {/* Auth buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={signInWithGoogle}
            style={{
              width: "100%", padding: "12px 20px", borderRadius: 12,
              border: "1px solid rgba(0,0,0,0.1)", background: "#fff",
              fontSize: 14, fontWeight: 600, color: "#0F0E0C",
              cursor: "pointer", display: "flex", alignItems: "center",
              justifyContent: "center", gap: 10,
              fontFamily: "'Plus Jakarta Sans', sans-serif",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            margin: "8px 0",
          }}>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
            <span style={{ fontSize: 12, color: "#9CA3AF" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "rgba(0,0,0,0.08)" }} />
          </div>

          {/* Email magic link */}
          {!emailSent ? (
            <>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && signInWithEmail()}
                placeholder="your@email.com"
                style={{
                  width: "100%", padding: "12px 16px", borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.1)", background: "#fff",
                  fontSize: 14, outline: "none", boxSizing: "border-box",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "#0F0E0C",
                }}
              />
              <button
                onClick={signInWithEmail}
                disabled={loading || !email}
                style={{
                  width: "100%", padding: "12px 20px", borderRadius: 12,
                  border: "none",
                  background: loading || !email ? "#E5E7EB" : "#2563EB",
                  color: loading || !email ? "#9CA3AF" : "#fff",
                  fontSize: 14, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                {loading ? "Sending…" : "Continue with email"}
              </button>
            </>
          ) : (
            <div style={{
              padding: "16px 20px", borderRadius: 12,
              background: "#EFF6FF", border: "1px solid #BFDBFE",
              fontSize: 13, color: "#1E40AF", lineHeight: 1.6,
            }}>
              Check your email for a login link. You can close this tab.
            </div>
          )}
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: "#C4BFB6", marginTop: 32, lineHeight: 1.6 }}>
          By continuing you agree to our Terms and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
