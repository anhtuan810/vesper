import { fmt, TYPE_COLOR } from "@/lib/utils";

interface DonutChartProps {
  data: [string, number][];
  total: number;
  netTotal: number;
}

export function DonutChart({ data, total, netTotal }: DonutChartProps) {
  const cx = 80, cy = 80, r = 62, stroke = 14;
  const circ = 2 * Math.PI * r;

  const segments = data.reduce<{ type: string; dash: number; offset: number }[]>(
    (acc, [type, val]) => {
      const pct = val / total;
      const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset + (data[acc.length - 1][1] / total) : 0;
      acc.push({ type, dash: Math.max(pct * circ - 2, 0), offset: prevOffset });
      return acc;
    },
    []
  );

  return (
    <svg width={160} height={160} viewBox="0 0 160 160">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F0EEE9" strokeWidth={stroke} />
      {segments.map(({ type, dash, offset }) => (
        <circle
          key={type}
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={TYPE_COLOR[type] || "#78716C"}
          strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={-offset * circ}
          strokeLinecap="butt"
          transform="rotate(-90 80 80)"
          style={{ transition: "all 0.6s ease" }}
        />
      ))}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="#9CA3AF" fontSize="9"
        fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="500">NET WORTH</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#0F0E0C" fontSize="18"
        fontFamily="'Plus Jakarta Sans', sans-serif" fontWeight="800" letterSpacing="-0.03em">
        {fmt(netTotal)}
      </text>
    </svg>
  );
}
