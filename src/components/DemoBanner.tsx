"use client";

import { useState, useEffect, useRef } from "react";
import { useSubscription } from "@/components/SubscriptionProvider";
import { readDemoExpiry } from "@/components/DemoExpiryWall";
import { DEMO_EXPIRED_EVENT } from "@/lib/api";

// SCREENSHOT BRANCH ONLY (demo-screenshots-no-banner): the "Demo account ·
// sample data | Subscribe" pill is suppressed so demo screenshots come out
// clean. Temporary — never merge this branch into main; the real banner lives
// there. The deadline watcher below is kept so the expiry wall still fires at
// 0:00 exactly as in production; only the visible pill is gone.
export function DemoBanner() {
  const { data } = useSubscription();
  const isDemo = !!data?.isDemo;

  // Live trial countdown from the session deadline (per-visitor demo). At zero,
  // fire the expiry event so DemoExpiryWall takes over at once.
  const [, setRemainingMs] = useState<number | null>(null);
  const firedRef = useRef(false);
  useEffect(() => {
    if (!isDemo) return;
    const update = () => {
      const deadline = readDemoExpiry();
      if (deadline == null) { setRemainingMs(null); return; }
      const rem = deadline - Date.now();
      setRemainingMs(Math.max(0, rem));
      if (rem <= 0 && !firedRef.current) {
        firedRef.current = true;
        window.dispatchEvent(new Event(DEMO_EXPIRED_EVENT));
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [isDemo]);

  return null;
}
