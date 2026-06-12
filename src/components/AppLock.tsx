"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { App } from "@capacitor/app";
import { isNative } from "@/lib/platform";
import { isAppLockEnabled, verifyIdentity } from "@/lib/native/app-lock";
import { VolnarLogo } from "@/components/VolnarLogo";

// Native-only Face ID gate. When the user has enabled App lock (Profile →
// Preferences), a full-screen brand overlay covers the app on cold start and
// whenever it returns from the background, until the system biometric check
// passes. Renders nothing on the web.
export function AppLock() {
  const [locked, setLocked] = useState(false);
  // Guards against stacked prompts (resume events can arrive while the Face ID
  // sheet is already up).
  const verifying = useRef(false);

  const prompt = useCallback(async () => {
    if (verifying.current) return;
    verifying.current = true;
    const ok = await verifyIdentity();
    verifying.current = false;
    if (ok) setLocked(false);
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    // Cold start: lock first, then prompt — the overlay must be up before any
    // portfolio content paints.
    isAppLockEnabled().then((enabled) => {
      if (cancelled || !enabled) return;
      setLocked(true);
      prompt();
    });

    // Background → re-lock (also blanks the app-switcher snapshot's content
    // beneath the overlay); foreground → prompt.
    const handle = App.addListener("appStateChange", async ({ isActive }) => {
      if (!(await isAppLockEnabled())) return;
      if (!isActive) {
        setLocked(true);
      } else {
        prompt();
      }
    });

    return () => {
      cancelled = true;
      handle.then((h) => h.remove()).catch(() => {});
    };
  }, [prompt]);

  if (!locked) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--bg)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 20,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <VolnarLogo size={44} />
      <button
        onClick={prompt}
        className="font-mono"
        style={{
          padding: "12px 32px", borderRadius: 12, border: "none",
          background: "var(--accent)", color: "var(--bg)",
          fontSize: 13, fontWeight: 600, letterSpacing: "0.04em",
          cursor: "pointer",
        }}
      >
        Unlock
      </button>
    </div>
  );
}
