"use client";

interface MiniSparklineProps {
  prices: number[];
  width?: number;
  height?: number;
}

export function MiniSparkline({ prices, width = 60, height = 28 }: MiniSparklineProps) {
  if (prices.length < 2) return <div style={{ width, height }} />;

  const W = width;
  const H = height;
  const PAD = 2;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = Math.max(max - min, max * 0.0001);

  const toX = (i: number) => (i / (prices.length - 1)) * W;
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2);

  const pts = prices.map((p, i) => [toX(i), toY(p)] as [number, number]);
  const up = prices[prices.length - 1] >= prices[0];
  const color = up ? "var(--positive-text)" : "var(--negative-text)";

  const linePath = pts
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const [lastX, lastY] = pts[pts.length - 1];
  const [firstX] = pts[0];
  const fillPath =
    linePath +
    ` L${lastX.toFixed(1)},${H} L${firstX.toFixed(1)},${H} Z`;

  const baselineY = toY(prices[0]);

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      style={{ display: "block", flexShrink: 0 }}
    >
      <path d={fillPath} fill={color} fillOpacity={0.12} stroke="none" />
      <line
        x1={0}
        y1={baselineY.toFixed(1)}
        x2={W}
        y2={baselineY.toFixed(1)}
        stroke="var(--border)"
        strokeWidth={0.5}
        strokeDasharray="1.5 2"
      />
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.25}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX.toFixed(1)} cy={lastY.toFixed(1)} r={1} fill={color} />
    </svg>
  );
}
