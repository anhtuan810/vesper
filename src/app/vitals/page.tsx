"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { NavBar } from "@/components/NavBar";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { DesktopVitals } from "@/components/overview/DesktopVitals";
import { WebShell } from "@/components/desktop/WebShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";
import { apiFetch } from "@/lib/api";
import type { MarketHighlight } from "@/lib/market-highlights";

export default function VitalsPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const [marketHighlights, setMarketHighlights] = useState<MarketHighlight[]>([]);

  // Mobile only: pull the daily market-news highlights for the Markets block at
  // the top of the page (desktop renders DesktopVitals, which doesn't show it).
  useEffect(() => {
    if (isDesktop !== false) return;
    const controller = new AbortController();
    apiFetch("/api/market-highlights", { signal: controller.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (body?.marketHighlights) setMarketHighlights(body.marketHighlights); })
      .catch(() => {});
    return () => controller.abort();
  }, [isDesktop]);

  // Neutral background until the device class is known — avoids a hydration flash.
  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-bg" />;
  }

  // Desktop web: a real Vitals page inside the new Twilight WebShell (the new nav
  // links here). Mobile/native keep the single-column NavBar layout.
  if (isDesktop) {
    return (
      <WebShell tab="vitals">
        <DesktopVitals />
      </WebShell>
    );
  }

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <NavBar
        tab="vitals"
        setTab={setTab}
        mutationCount={0}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
        empty
      />
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "0 0 110px",
        }}
      >
        <VitalsContent marketHighlights={marketHighlights} />
      </div>
    </div>
  );
}
