"use client";

import { useState, useEffect } from "react";
import { formatMoney, formatMoneyParts } from "@/lib/money";
import { useDisplayCurrency } from "@/lib/hooks";

interface NetWorthHeroProps {
  netTotal: number;
  grossTotal: number;
  totalDebt: number;
}

function useMonthlyChange(currentNet: number) {
  const [change, setChange] = useState<{ abs: number; pct: number } | null>(null);

  useEffect(() => {
    fetch("/api/snapshots?range=1M")
      .then((r) => r.json())
      .then((body) => {
        const data: { date: string; total_value: number }[] = body.data ?? [];
        if (data.length < 2) return;
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

export function NetWorthHero({ netTotal, grossTotal, totalDebt }: NetWorthHeroProps) {
  const displayCurrency = useDisplayCurrency();
  const change = useMonthlyChange(netTotal);
  const up = change ? change.pct >= 0 : true;
  const parts = formatMoneyParts(netTotal, displayCurrency);

  return (
    <div>
      <div
        className="font-mono uppercase text-faint mb-3"
        style={{ fontSize: 10, letterSpacing: "0.2em" }}
      >
        Net worth
      </div>
      <div
        className="font-serif font-light leading-none text-fg"
        style={{
          fontSize: "clamp(40px, 9vw, 56px)",
          letterSpacing: "-0.035em",
          fontVariationSettings: "'opsz' 72",
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "flex-start", columnGap: "0.12em" }}>
          <span
            className="text-dim"
            style={{ fontSize: "0.55em", lineHeight: 1, paddingTop: "0.07em" }}
          >
            {parts.sign}{parts.symbol}
          </span>
          <span style={{ lineHeight: "inherit" }}>{parts.amount}</span>
        </span>
      </div>
      {totalDebt > 0 && (
        <div className="font-mono text-faint mt-2" style={{ fontSize: 10 }}>
          Gross {formatMoney(grossTotal, displayCurrency)} · Debt {formatMoney(totalDebt, displayCurrency)}
        </div>
      )}
      {change && (
        <div className="flex items-center mt-2" style={{ gap: 10 }}>
          <span
            className="font-mono"
            style={{
              fontSize: 11,
              fontWeight: 500,
              padding: "4px 8px",
              borderRadius: 6,
              background: up ? "rgba(107,170,117,0.12)" : "rgba(201,122,110,0.12)",
              color: up ? "var(--positive)" : "var(--negative)",
            }}
          >
            {up ? "+" : ""}{change.pct.toFixed(2)}%
          </span>
          <span className="text-dim" style={{ fontSize: 12 }}>
            {change.abs >= 0 ? "+" : ""}{formatMoney(change.abs, displayCurrency)} this month
          </span>
        </div>
      )}
    </div>
  );
}
