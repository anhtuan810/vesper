"use client";

import { useState } from "react";

export type LedgerEntry = {
  date: string;
  title: string;
  tag: "user" | "auto";
  why: string;
  impact: string;
  dir: "up" | "dn";
};

// A single journal row: collapsed to its title line, expands on click / Enter /
// Space with the chevron rotating.
export function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`led${open ? " open" : ""}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen((o) => !o)}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          setOpen((o) => !o);
        }
      }}
    >
      <span className={`led-dot${entry.dir === "dn" ? " dn" : ""}`} />
      <div className="led-main">
        <div className="led-l1">
          <span className="led-date">{entry.date}</span>
          <span className="led-title">{entry.title}</span>
          <span className={`led-tag ${entry.tag}`}>{entry.tag === "user" ? "You" : "Auto"}</span>
        </div>
        <div className="led-exp">
          <div className="led-why">{entry.why}</div>
          <div className={`led-impx ${entry.dir}`}>{entry.impact}</div>
        </div>
      </div>
      <svg className="led-chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
