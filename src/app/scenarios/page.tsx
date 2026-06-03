"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAssets, useDisplayCurrencyState } from "@/lib/hooks";
import { NavBar } from "@/components/NavBar";
import { ScenarioBuilder } from "@/components/scenario/ScenarioBuilder";
import { ScenarioProjection } from "@/components/scenario/ScenarioProjection";
import { ScenarioLookback } from "@/components/scenario/ScenarioLookback";
import { ScenarioStress } from "@/components/scenario/ScenarioStress";
import { useIsDesktop } from "@/lib/hooks/useIsDesktop";

type Mode = "adjust" | "project" | "lookback" | "stress";

const MODE_LABEL: Record<Mode, string> = { adjust: "Adjust", project: "Project", lookback: "Look back", stress: "Stress test" };

export default function ScenariosPage() {
  const router = useRouter();
  const isDesktop = useIsDesktop();
  const { user, loading: userLoading } = useUser();
  const { assets, loading: assetsLoading } = useAssets(user?.id);
  const { currency, loaded: currencyLoaded } = useDisplayCurrencyState();
  const [mode, setMode] = useState<Mode>("adjust");

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
        {/* Quiet segmented switcher: Adjust (present builder) | Project (forward) */}
        <div style={{ display: "flex", gap: 4, paddingTop: 28, marginBottom: 4 }}>
          {(["adjust", "project", "lookback", "stress"] as Mode[]).map((mKey) => {
            const active = mode === mKey;
            return (
              <button
                key={mKey}
                onClick={() => setMode(mKey)}
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: "0.01em",
                  background: active ? "var(--surface-elev)" : "transparent",
                  color: active ? "var(--text)" : "var(--text-faint)",
                  transition: "background 0.15s, color 0.15s",
                }}
              >
                {MODE_LABEL[mKey]}
              </button>
            );
          })}
        </div>

        {mode === "adjust" && (
          <ScenarioBuilder
            realAssets={assets}
            displayCurrency={currency}
            userId={user?.id}
            isDesktop={!!isDesktop}
          />
        )}
        {mode === "project" && <ScenarioProjection displayCurrency={currency} isDesktop={!!isDesktop} />}
        {mode === "lookback" && <ScenarioLookback realAssets={assets} displayCurrency={currency} isDesktop={!!isDesktop} />}
        {mode === "stress" && <ScenarioStress displayCurrency={currency} isDesktop={!!isDesktop} />}
      </div>
    </div>
  );
}
