"use client";

import { fmt } from "@/lib/utils";

interface NetWorthHeroProps {
  netTotal: number;
  grossTotal: number;
  totalDebt: number;
}

function splitAmount(fmtd: string): { pre: string; main: string; suf: string } {
  const match = fmtd.match(/^(€)([\d,.]+)([kM]?)$/);
  if (!match) return { pre: "€", main: fmtd.slice(1), suf: "" };
  return { pre: match[1], main: match[2], suf: match[3] };
}

export function NetWorthHero({ netTotal, grossTotal, totalDebt }: NetWorthHeroProps) {
  const { pre, main, suf } = splitAmount(fmt(netTotal));

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
        <span
          className="text-dim inline-block"
          style={{ fontSize: "0.56em", verticalAlign: "top", lineHeight: "1.55", marginRight: 3 }}
        >
          {pre}
        </span>
        {main}
        {suf && (
          <span className="text-dim" style={{ fontSize: "0.65em" }}>
            {suf}
          </span>
        )}
      </div>
      {totalDebt > 0 && (
        <div className="font-mono text-faint mt-2" style={{ fontSize: 10 }}>
          Gross {fmt(grossTotal)} · Debt {fmt(totalDebt)}
        </div>
      )}
    </div>
  );
}
