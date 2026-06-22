"use client";

import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { isNative } from "@/lib/platform";
import {
  isAppLockEnabled, setAppLockEnabled, biometricAvailable, verifyIdentity,
} from "@/lib/native/app-lock";
import { isPushEnabled, enablePush, disablePush } from "@/lib/native/push";

// Native-only preference rows (Face ID lock, notifications) appended to the
// Profile → Preferences card. Renders nothing on the web.

function Toggle({ on, busy, onClick }: { on: boolean; busy: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      aria-pressed={on}
      style={{
        width: 44, height: 26, borderRadius: 13, border: "none", padding: 2,
        background: on ? "var(--accent)" : "var(--border-strong)",
        cursor: busy ? "default" : "pointer", flexShrink: 0,
        opacity: busy ? 0.6 : 1, transition: "background 0.15s",
      }}
    >
      <div
        style={{
          width: 22, height: 22, borderRadius: "50%", background: "var(--surface)",
          transform: on ? "translateX(18px)" : "translateX(0)",
          transition: "transform 0.15s",
        }}
      />
    </button>
  );
}

function Row({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
        borderTop: "0.5px solid var(--border)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 500,
            color: "var(--text)", fontVariationSettings: "'opsz' 18",
          }}
        >
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>
        )}
      </div>
      {children}
    </div>
  );
}

export function NativeSettingsRows() {
  const [ready, setReady] = useState(false);
  const [lockAvailable, setLockAvailable] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState<"lock" | "push" | null>(null);
  const [pushNote, setPushNote] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative()) return;
    Promise.all([biometricAvailable(), isAppLockEnabled(), isPushEnabled()]).then(
      ([available, lock, push]) => {
        setLockAvailable(available);
        setLockOn(lock);
        setPushOn(push);
        setReady(true);
      }
    );
  }, []);

  if (!ready) return null;

  const toggleLock = async () => {
    setBusy("lock");
    try {
      if (lockOn) {
        // Re-verify before disabling so a passerby can't switch the lock off.
        if (await verifyIdentity()) {
          await setAppLockEnabled(false);
          setLockOn(false);
        }
      } else if (await verifyIdentity()) {
        await setAppLockEnabled(true);
        setLockOn(true);
      }
    } finally {
      setBusy(null);
    }
  };

  const togglePush = async () => {
    setBusy("push");
    setPushNote(null);
    try {
      // The web app updates independently of the installed binary; an old
      // binary won't have the plugin compiled in.
      if (!Capacitor.isPluginAvailable("PushNotifications")) {
        setPushNote("Notifications need a newer build of the app — update Volnar, then try again.");
        return;
      }
      if (pushOn) {
        await disablePush();
        setPushOn(false);
      } else {
        const ok = await enablePush();
        setPushOn(ok);
        if (!ok) {
          setPushNote("Allow notifications for Volnar in iOS Settings, then try again.");
        }
      }
    } catch {
      setPushNote("Couldn\u2019t update notifications \u2014 try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {lockAvailable && (
        <Row label="App lock" sub="Require Face ID when Volnar opens">
          <Toggle on={lockOn} busy={busy === "lock"} onClick={toggleLock} />
        </Row>
      )}
      <Row label="Notifications" sub="Market moves that touch your positions">
        <Toggle on={pushOn} busy={busy === "push"} onClick={togglePush} />
      </Row>
      {pushNote && (
        <div style={{ padding: "0 16px 12px", fontSize: 12, color: "var(--text-faint)" }}>
          {pushNote}
        </div>
      )}
    </>
  );
}
