"use client";

import { useState } from "react";

type Row = readonly [string, string, "" | "up" | "dn"];
type Scenario = { label: string; q: string; rows: readonly Row[] };

const SCENARIOS: Record<"a" | "b", Scenario> = {
  a: {
    label: "Sell flat → world index",
    q: "What if I sell the flat and buy a world index?",
    rows: [
      ["Net worth today", "Unchanged", ""],
      ["Rental income lost", "−€1.500 / mo", "dn"],
      ["Equity concentration", "32% → 71%", ""],
      ["Projected 10-yr · 6%/yr*", "≈ €734.000", "up"],
    ],
  },
  b: {
    label: "Hold everything as-is",
    q: "What if I just hold everything as it is?",
    rows: [
      ["Net worth today", "Unchanged", ""],
      ["Cash earning nothing", "−€2.100 / yr", "dn"],
      ["Equity concentration", "32% · unchanged", ""],
      ["Projected 10-yr · 6%/yr*", "≈ €690.000", "up"],
    ],
  },
};

export function WhatIf() {
  const [active, setActive] = useState<"a" | "b">("a");
  const s = SCENARIOS[active];

  return (
    <div className="visual card wif reveal" style={{ transitionDelay: ".12s" }}>
      <div className="wif-input">
        <span className="ph">Ask a what-if…</span>
        <span className="snd">
          <svg className="ic">
            <use href="#i-arrow" />
          </svg>
        </span>
      </div>
      <div className="wif-chips">
        {(["a", "b"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`wchip${active === k ? " on" : ""}`}
            aria-pressed={active === k}
            onClick={() => setActive(k)}
          >
            {SCENARIOS[k].label}
          </button>
        ))}
      </div>
      <div className="wifq">
        <span className="q">{s.q}</span>
      </div>
      {s.rows.map((r, i) => (
        <div className="wr" key={i}>
          <span className="k">{r[0]}</span>
          <span className={`v${r[2] ? ` ${r[2]}` : ""}`}>{r[1]}</span>
        </div>
      ))}
      <div className="wif-foot">
        Simulated in chat · deterministic math · nothing moves until you decide
      </div>
    </div>
  );
}
