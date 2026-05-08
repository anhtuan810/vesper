"use client";

import { PriceDisplay } from "@/components/PriceDisplay";
import { fmt } from "@/lib/utils";

interface NetWorthHeroProps {
  netTotal: number;
  grossTotal: number;
  totalDebt: number;
}

export function NetWorthHero({ netTotal, grossTotal, totalDebt }: NetWorthHeroProps) {
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
          fontVariationSettings: "'opsz' 144",
        }}
      >
        <PriceDisplay amount={netTotal} compact />
      </div>
      {totalDebt > 0 && (
        <div className="font-mono text-faint mt-2" style={{ fontSize: 10 }}>
          Gross {fmt(grossTotal, "EUR")} · Debt {fmt(totalDebt, "EUR")}
        </div>
      )}
    </div>
  );
}
