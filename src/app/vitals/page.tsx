"use client";

import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { WebShell } from "@/components/desktop/WebShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

export default function VitalsPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  // Neutral background until the device class is known — avoids a hydration flash.
  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-bg" />;
  }

  // Desktop web: a real Vitals page inside the new Twilight WebShell (the new nav
  // links here). Mobile/native keep the single-column NavBar layout.
  if (isDesktop) {
    return (
      <WebShell tab="vitals">
        <VitalsContent />
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
        <VitalsContent />
      </div>
    </div>
  );
}
