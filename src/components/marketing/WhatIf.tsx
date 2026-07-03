"use client";

import { useState } from "react";
import { useI18n } from "./i18n";
import type { DemoCta } from "./MarketingBody";

// The mock's input can't be typed in — clicking it opens the live demo, where
// the real composer is. The spread (veil + navigation + tracking) comes from
// MarketingBody, and the placeholder copy announces the jump before the click.
export function WhatIf({ demoCta }: { demoCta: DemoCta }) {
  const { m } = useI18n();
  const W = m.whatif;
  const [active, setActive] = useState<"a" | "b">("a");
  const s = W.scenarios[active];

  return (
    <div className="visual card wif reveal" style={{ transitionDelay: ".12s" }}>
      <a className="wif-input" {...demoCta}>
        <span className="ph">{W.placeholder}</span>
        <span className="snd">
          <svg className="ic">
            <use href="#i-arrow" />
          </svg>
        </span>
      </a>
      <div className="wif-chips">
        {(["a", "b"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`wchip${active === k ? " on" : ""}`}
            aria-pressed={active === k}
            onClick={() => setActive(k)}
          >
            {W.scenarios[k].label}
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
      <div className="wif-foot">{W.foot}</div>
    </div>
  );
}
