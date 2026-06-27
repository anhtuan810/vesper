"use client";

import { useRef, useState } from "react";
import { HOLDINGS, type HoldingGroup, type Position } from "./data";

function Logo({ badge, color }: { badge: string; color: string }) {
  if (badge === "house") {
    return (
      <span className="plogo" style={{ borderColor: color }}>
        <svg viewBox="0 0 24 24" style={{ stroke: color }} aria-hidden="true">
          <path d="M4 11l8-6 8 6M6 10v9h12v-9" />
        </svg>
      </span>
    );
  }
  return (
    <span className="plogo" style={{ borderColor: color, color }}>
      {badge}
    </span>
  );
}

function PositionRow({ p, color }: { p: Position; color: string }) {
  return (
    <div className="pos">
      <Logo badge={p.badge} color={color} />
      <div className="pos-m">
        <span className="pos-n">{p.name}</span>
        <span className="pos-sub">{p.sub}</span>
      </div>
      {p.spark && (
        <svg className={`spark ${p.spark.dir}`} viewBox="0 0 80 28" aria-hidden="true">
          <polyline points={p.spark.points} />
        </svg>
      )}
      <div className="pos-v">
        <span className="pos-val">{p.value}</span>
        {p.change && <span className={`pos-chg ${p.change.dir}`}>{p.change.label}</span>}
        {p.owned && <span className="pos-own">{p.owned}</span>}
      </div>
    </div>
  );
}

function Group({ group, index }: { group: HoldingGroup; index: number }) {
  const [open, setOpen] = useState(false);
  const [maxH, setMaxH] = useState(0);
  const posRef = useRef<HTMLDivElement>(null);
  const panelId = `hg-pos-${index}`;
  const accent = `var(${group.token})`;

  const toggle = () => {
    const el = posRef.current;
    const next = !open;
    setMaxH(next && el ? el.scrollHeight : 0);
    setOpen(next);
  };

  return (
    <div className={`hg${open ? " open" : ""}`}>
      <button className="hg-h" type="button" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
        <span className="dr-n">
          <i style={{ background: accent }} />
          {group.name}
        </span>
        <span className="dr-bar">
          <span style={{ width: group.bar, background: accent }} />
        </span>
        <span className="dr-v">
          {group.value}
          <small>{group.pct}</small>
        </span>
        <svg className="hg-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="hg-pos" id={panelId} ref={posRef} style={{ maxHeight: maxH }}>
        {group.positions.map((p) => (
          <PositionRow key={p.name} p={p} color={group.color} />
        ))}
      </div>
    </div>
  );
}

// Asset-class list — each group expands on click to reveal its positions.
// Groups start collapsed and open independently of one another.
export function OverviewHoldings() {
  return (
    <div className="holds">
      {HOLDINGS.map((group, i) => (
        <Group key={group.name} group={group} index={i} />
      ))}
    </div>
  );
}
