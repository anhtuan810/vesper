"use client";

import { useState } from "react";

export type LedgerEntry = {
  date: string;
  title: string;
  tag: string; // "user" | "auto"
  why: string;
  impact: string;
  dir: string; // "up" | "dn"
};

// A single journal row: collapsed to its title line, expands on click / Enter /
// Space with the chevron rotating. The first row of the section rests open so
// the why + impact — the point of the product — are visible without a click.
export function LedgerRow({ entry, tagLabel, defaultOpen }: { entry: LedgerEntry; tagLabel: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen ?? false);

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
          <span className={`led-tag ${entry.tag === "user" ? "user" : "auto"}`}>{tagLabel}</span>
        </div>
        <div className="led-exp">
          <div className="led-why">{entry.why}</div>
          <div className={`led-impx ${entry.dir === "dn" ? "dn" : "up"}`}>{entry.impact}</div>
        </div>
      </div>
      <svg className="led-chev" viewBox="0 0 24 24">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </div>
  );
}
