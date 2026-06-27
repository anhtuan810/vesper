"use client";

import { useEffect, useState } from "react";
import { useI18n } from "./i18n";

export function MemoryBanner() {
  const { m } = useI18n();
  const memories = m.notif.memories;
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    let swap: ReturnType<typeof setTimeout>;
    const id = setInterval(() => {
      setShown(false);
      swap = setTimeout(() => {
        setI((p) => (p + 1) % memories.length);
        setShown(true);
      }, 300);
    }, 4200);
    return () => {
      clearInterval(id);
      clearTimeout(swap);
    };
  }, [memories.length]);

  const [when, title, sub] = memories[i % memories.length];

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
          <span className="nb-time">{m.notif.memoryTime}</span>
        </div>
        <div className="nb-t">{title}</div>
        <div className="nb-s">{sub}</div>
      </div>
    </div>
  );
}
