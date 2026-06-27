"use client";

import { useState, type KeyboardEvent } from "react";
import { EP_ENTRIES } from "./data";
import { AREAS, TOTAL_LINE, MARKERS, GRID, X_LABELS } from "./chartGeometry";

// Net-worth stacked-area chart + the selected-entry panel it drives. One marker
// per journal entry; clicking (or Enter/Space on) a marker fills it and swaps
// the panel below. Defaults to the most recent entry, exactly as the mockup.
export function OverviewChart() {
  const [selected, setSelected] = useState(EP_ENTRIES.length - 1);
  const entry = EP_ENTRIES[selected];

  const onMarkerKey = (e: KeyboardEvent<SVGCircleElement>, i: number) => {
    if (e.key === "Enter" || e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      setSelected(i);
    }
  };

  return (
    <>
      <div className="chartbox">
        <svg
          className="nw"
          viewBox="0 0 980 300"
          role="img"
          aria-label="Net worth by asset class 2021 to 2026"
        >
          {GRID.map((g, i) => (
            <g key={`g${i}`}>
              <line className="g" x1={g.x1} y1={g.y} x2={g.x2} y2={g.y} />
              <text className="yl" x={g.label.x} y={g.label.y} textAnchor="end">
                {g.label.text}
              </text>
            </g>
          ))}

          {AREAS.map((a, i) => (
            <polygon key={`a${i}`} className="ab" fill={a.fill} points={a.points} />
          ))}

          <polyline className="totln" points={TOTAL_LINE} />

          <g role="group" aria-label="Journal entries">
            {MARKERS.map((m) => {
              const e = EP_ENTRIES[m.i];
              const isSel = m.i === selected;
              return (
                <circle
                  key={m.i}
                  className={`mk${isSel ? " sel" : ""}`}
                  cx={m.x}
                  cy={m.y}
                  r={4.5}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSel}
                  aria-label={`${e.date}: ${e.title}`}
                  onClick={() => setSelected(m.i)}
                  onKeyDown={(ev) => onMarkerKey(ev, m.i)}
                />
              );
            })}
          </g>

          {X_LABELS.map((x, i) => (
            <text
              key={`x${i}`}
              className="xl"
              x={x.x}
              y={x.y}
              textAnchor={x.anchor as "start" | "middle" | "end"}
            >
              {x.text}
            </text>
          ))}
        </svg>
      </div>

      <div className="ep-inline" aria-live="polite">
        <div className="ep-cue">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4v12M6 12l6 6 6-6" />
          </svg>
          The decision behind the selected point — tap any dot on the line
        </div>
        <div className="ep-top">
          <span className="ep-date">{entry.date}</span>
          <span className={`ep-kind${entry.kc ? ` ${entry.kc}` : ""}`}>{entry.kind}</span>
        </div>
        <h3 className="ep-title">{entry.title}</h3>
        <p className="ep-ctx">{entry.ctx}</p>
        <p className="ep-why">{entry.why}</p>
        <div className="ep-foot">
          <span className={`ep-imp${entry.impc === "dn" ? " dn" : ""}`}>
            {(entry.impc === "dn" ? "▼ " : "▲ ") + entry.imp}
          </span>
          <span className="ep-ask">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 10h8M8 14h5M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9l-4 4Z" />
            </svg>
            <span>{`Ask: ${entry.ask}`}</span>
          </span>
        </div>
      </div>
    </>
  );
}
