"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNative } from "@/lib/platform";
import {
  isAppLockEnabled, verifyIdentity, APP_LOCK_CHANGED_EVENT,
} from "@/lib/native/app-lock";
import { VolnarLogo } from "@/components/VolnarLogo";

// Marks the current app session as unlocked. Tab switches are full page
// navigations, so React state alone would re-prompt on every tab; this flag
// survives navigations and is cleared when the app actually leaves the
// foreground (and by iOS when the app is killed).
const UNLOCKED_FLAG = "volnar.unlocked";

// Native-only Face ID gate. When the user has enabled App lock (Profile →
// Preferences), a full-screen brand overlay covers the app on cold start and
// whenever it returns from the background, until the system biometric check
// passes. Renders nothing on the web.
//
// Re-locking keys off document visibility, NOT appStateChange: presenting the
// Face ID sheet itself resigns the app's active state, so locking on
// resign-active re-locks in a loop. The webview only goes hidden when the app
// genuinely leaves the foreground.
export function AppLock() {
  const [locked, setLocked] = useState(false);
  const lockedRef = useRef(false);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  // Cached preference so the visibility-hidden handler can act synchronously
  // (an async read may not complete before iOS suspends the webview).
  const enabledRef = useRef(false);
  // Guards against stacked prompts (visibility events can arrive while the
  // Face ID sheet is already up).
  const verifying = useRef(false);

  const prompt = useCallback(async () => {
    if (verifying.current) return;
    verifying.current = true;
    const ok = await verifyIdentity();
    verifying.current = false;
    if (ok) {
      try {
        sessionStorage.setItem(UNLOCKED_FLAG, "1");
      } catch {}
      setLocked(false);
    }
  }, []);

  useEffect(() => {
    if (!isNative()) return;

    let cancelled = false;

    isAppLockEnabled().then((enabled) => {
      if (cancelled) return;
      enabledRef.current = enabled;
      if (!enabled) return;
      let unlocked = false;
      try {
        unlocked = sessionStorage.getItem(UNLOCKED_FLAG) === "1";
      } catch {}
      // Cold start (or a navigation after a background re-lock): gate before
      // any portfolio content paints. Same-session navigations pass through.
      if (!unlocked) {
        setLocked(true);
        prompt();
      }
    });

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Leaving the foreground: re-arm the lock so the app-switcher snapshot
        // and the next return are covered.
        if (enabledRef.current) {
          try {
            sessionStorage.removeItem(UNLOCKED_FLAG);
          } catch {}
          setLocked(true);
        }
      } else if (lockedRef.current) {
        prompt();
      }
    };

    // Keeps the cached preference current when the toggle changes in Profile.
    const onPrefChange = (e: Event) => {
      enabledRef.current = Boolean((e as CustomEvent).detail?.enabled);
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(APP_LOCK_CHANGED_EVENT, onPrefChange);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(APP_LOCK_CHANGED_EVENT, onPrefChange);
    };
  }, [prompt]);

  if (!locked) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "var(--bg)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "var(--space-5)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <VolnarLogo size={44} />
      <button
        onClick={prompt}
        className="font-numeric"
        style={{
          padding: "var(--space-3) var(--space-8)", borderRadius: "var(--radius-md)", border: "none",
          background: "var(--accent)", color: "var(--bg)",
          fontSize: "var(--fs-meta)", fontWeight: 600, letterSpacing: "var(--tracking-label)",
          cursor: "pointer",
        }}
      >
        Unlock
      </button>
    </div>
  );
}
