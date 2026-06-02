"use client";

import { useRouter } from "next/navigation";
import { useUser, useAssets, useDisplayCurrencyState } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { ScenarioBuilder } from "@/components/scenario/ScenarioBuilder";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

export default function ScenariosPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, loading: userLoading } = useUser();
  const { assets, loading: assetsLoading } = useAssets(user?.id);
  const { currency, loaded: currencyLoaded } = useDisplayCurrencyState();

  const setTab = (t: "portfolio" | "diary" | "profile" | "vitals") => {
    router.push(t === "portfolio" ? "/" : "/" + t);
  };

  // Neutral background until the device class, user, assets and FX are known —
  // avoids a hydration flash and lets the sandbox clone a settled portfolio.
  if (isDesktop === undefined || userLoading || assetsLoading || !currencyLoaded) {
    return <div className="min-h-screen bg-bg" />;
  }

  return (
    <div className="min-h-screen bg-bg">
      <NavBar
        tab="portfolio"
        setTab={setTab}
        mutationCount={0}
        liveCount={0}
        totalSymbols={0}
        refreshing={false}
        refreshPrices={() => {}}
        empty
      />
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 0 40px" }}>
        <ScenarioBuilder
          realAssets={assets}
          displayCurrency={currency}
          userId={user?.id}
          isDesktop={!!isDesktop}
        />
      </div>
    </div>
  );
}
