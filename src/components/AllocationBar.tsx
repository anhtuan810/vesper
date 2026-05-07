"use client";

import { fmt } from "@/lib/utils";

export interface AllocationItem {
  label: string;
  value: number;
  color: string;
}

interface AllocationBarProps {
  items: AllocationItem[];
  total: number;
}

export function AllocationBar({ items, total }: AllocationBarProps) {
  if (items.length === 0 || total === 0) return null;

  return (
    <div>
      {/* Segmented bar */}
      <div className="flex h-2 rounded-full overflow-hidden" style={{ gap: 2 }}>
        {items.map(({ label, value, color }) => {
          const pct = (value / total) * 100;
          return (
            <div
              key={label}
              style={{ width: `${pct}%`, background: color, opacity: 0.85, flexShrink: 0 }}
            />
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 space-y-3">
        {items.map(({ label, value, color }) => {
          const pct = (value / total) * 100;
          return (
            <div key={label} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="rounded-full shrink-0"
                  style={{ width: 7, height: 7, background: color }}
                />
                <span className="text-[13px] text-fg">{label}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-[12px] text-dim">{pct.toFixed(0)}%</span>
                <span className="font-mono text-[13px] font-medium text-fg" style={{ minWidth: 60, textAlign: "right" }}>
                  {fmt(value)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
