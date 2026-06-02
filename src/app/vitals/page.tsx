"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { NavBar } from "@/components/NavBar";
import { VitalsContent } from "@/components/vitals/VitalsContent";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

export default function VitalsPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();

  // Desktop folds Vitals into the Portfolio surface; this route only exists on mobile.
  useEffect(() => {
    if (isDesktop) router.replace("/");
  }, [isDesktop, router]);

  if (isDesktop !== false) {
    return <div className="min-h-screen bg-bg" />;
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
