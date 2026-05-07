"use client";

interface MiniSparklineProps {
  prices: number[];
}

export function MiniSparkline({ prices }: MiniSparklineProps) {
  if (prices.length < 2) return <div style={{ width: 44, height: 22 }} />;

  const W = 44;
  const H = 22;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, max * 0.0001);

  const toX = (i: number) => (i / (prices.length - 1)) * W;
  const toY = (v: number) => H - 2 - ((v - min) / range) * (H - 4);

  const pts = prices
    .map((p, i) => `${toX(i).toFixed(1)},${toY(p).toFixed(1)}`)
    .join(" ");

  const up = prices[prices.length - 1] >= prices[0];

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", flexShrink: 0 }}
    >
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "var(--positive)" : "var(--negative)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
