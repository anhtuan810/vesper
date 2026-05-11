"use client";

import { useState, useEffect } from "react";
import { formatMoney } from "@/lib/money";
import { useDisplayCurrencyState } from "@/lib/hooks";

interface NetWorthHeroProps {
  netTotal: number;
}

function useMonthlyChange(currentNet: number) {
  const [change, setChange] = useState<{ abs: number; pct: number } | null>(null);

  useEffect(() => {
    fetch("/api/snapshots?range=1M")
      .then((r) => r.json())
      .then((body) => {
        const data: { date: string; total_value: number }[] = body.data ?? [];
        if (data.length < 7) return;
        const oldest = data[0].total_value;
        if (oldest === 0) return;
        const abs = currentNet - oldest;
        const pct = (abs / oldest) * 100;
        setChange({ abs, pct });
      })
      .catch(() => {});
  }, [currentNet]);

  return change;
}

export function NetWorthHero({ netTotal }: NetWorthHeroProps) {
  const { currency: displayCurrency, loaded: currencyLoaded } = useDisplayCurrencyState();
  const change = useMonthlyChange(netTotal);
  const up = change ? change.pct >= 0 : true;

  if (!currencyLoaded) {
    return (
      <div>
        <div className="text-dim mb-[14px]" style={{ fontSize: 14 }}>
          Total net worth
        </div>
        <div
          className="bg-surface-elev rounded-lg animate-pulse"
          style={{ height: 56, width: "60%", maxWidth: 280 }}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="text-dim mb-[14px]" style={{ fontSize: 14 }}>
        Total net worth
      </div>

      {/* Hero number — serif, monochrome */}
      <div
        className="font-serif leading-none"
        style={{
          fontSize: 54,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: "var(--hero)",
          fontVariationSettings: "'opsz' 60",
        }}
      >
        <span>{formatMoney(netTotal, displayCurrency)}</span>
      </div>

      {/* Change pill — only after 7 snapshots */}
      {change && (
        <div className="flex items-center mt-[18px]" style={{ gap: 10 }}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 500,
              padding: "5px 12px",
              borderRadius: 999,
              background: up ? "var(--positive-soft)" : "var(--negative-soft)",
              color: up ? "var(--positive-text)" : "var(--negative-text)",
            }}
          >
            {up ? "↑" : "↓"} {Math.abs(change.pct).toFixed(1)}% this month
          </span>
          <span className="text-dim" style={{ fontSize: 14 }}>
            {change.abs >= 0 ? "+" : ""}{formatMoney(change.abs, displayCurrency)}
          </span>
        </div>
      )}
    </div>
  );
}
