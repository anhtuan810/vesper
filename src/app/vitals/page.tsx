"use client";

import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { DesktopShell } from "@/components/desktop/DesktopShell";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

export default function VitalsPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  if (isDesktop === undefined) {
    return <div className="min-h-screen bg-bg" />;
  }

  // Desktop: Vitals is its own sidebar surface (grid + library on top).
  if (isDesktop) {
    return (
      <DesktopShell tab="vitals">
        <VitalsContent layout="grid" libraryPosition="top" />
      </DesktopShell>
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
