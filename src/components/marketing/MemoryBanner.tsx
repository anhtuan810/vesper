"use client";

import { useEffect, useState } from "react";

// The "On this day" memory notification cycles through a few recollections.
const MEMORIES: ReadonlyArray<readonly [string, string, string]> = [
  ["On this day · 1 year ago", "You crossed €1.000.000", "A year on, you sit at €1.290.083."],
  ["On this day · 2 years ago", "You bought the 2022 bottom", "What you added that week is up €120.000."],
  ["On this day · 1 month ago", "You trimmed Bitcoin at its record", "+€34.000 realised — the core still runs."],
];

export function MemoryBanner() {
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setShown(false);
      swap = setTimeout(() => {
        setI((p) => (p + 1) % MEMORIES.length);
        setShown(true);
      }, 300);
    }, 4200);
    return () => {
      clearInterval(id);
      clearTimeout(swap);
    };
  }, []);

  const [when, title, sub] = MEMORIES[i];

  return (
    <div className="nb mem">
      <div className="nb-ic">
        <svg className="ic">
          <use href="#i-clock" />
        </svg>
      </div>
      <div className="nb-b nb-fade" style={{ opacity: shown ? 1 : 0 }}>
        <div className="nb-top">
          <span className="nb-app">{when}</span>
          <span className="nb-time">memory</span>
        </div>
        <div className="nb-t">{title}</div>
        <div className="nb-s">{sub}</div>
      </div>
    </div>
  );
}
