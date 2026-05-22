import type { LiquidityPostureValue } from '@/lib/vitals/liquidityPosture';

// Fixed tier colors — constant across themes
const TIER_COLORS = {
  sameDay:     'var(--accent)',
  market1w:    '#7AB395',
  slow1mo:     '#C4A86E',
  sixMonthPlus: '#A89F84',
  locked:      '#5E5A52',
};

const LEGEND_LABELS = [
  { key: 'sameDay',      color: TIER_COLORS.sameDay,      label: (pct: number) => `${pct.toFixed(0)}% cash` },
  { key: 'market1w',     color: TIER_COLORS.market1w,     label: (pct: number) => `${pct.toFixed(0)}% market` },
  { key: 'slow1mo',      color: TIER_COLORS.slow1mo,      label: (pct: number) => `${pct.toFixed(0)}% slow` },
  { key: 'sixMonthPlus', color: TIER_COLORS.sixMonthPlus, label: (pct: number) => `${pct.toFixed(0)}% property` },
  { key: 'locked',       color: TIER_COLORS.locked,       label: (pct: number) => `${pct.toFixed(0)}% locked` },
];

const GAP = 2;
const TOTAL_W = 320;
const RECT_AREA = TOTAL_W - 4 * GAP; // 312px for 5 rects

interface Props {
  data: LiquidityPostureValue;
}

export function LiquidityStack({ data }: Props) {
  const tiers = [
    { pct: data.sameDayPct,      color: TIER_COLORS.sameDay },
    { pct: data.oneWeekPct,      color: TIER_COLORS.market1w },
    { pct: data.oneMonthPct,     color: TIER_COLORS.slow1mo },
    { pct: data.sixMonthPlusPct, color: TIER_COLORS.sixMonthPlus },
    { pct: data.lockedPct,       color: TIER_COLORS.locked },
  ];

  const totalPct = tiers.reduce((s, t) => s + t.pct, 0) || 100;

  // Compute widths proportionally; distribute rounding to last rect
  let curX = 0;
  const rects = tiers.map((t, i) => {
    const isLast = i === tiers.length - 1;
    const w = isLast
      ? TOTAL_W - curX
      : Math.max(2, Math.round((t.pct / totalPct) * RECT_AREA));
    const rect = { x: curX, w, color: t.color };
    curX += w + (isLast ? 0 : GAP);
    return rect;
  });

  // Buffer threshold x position (linear)
  const bufferX = Math.round((data.liquidBufferPct / 100) * TOTAL_W);

  const legendData = [
    { color: TIER_COLORS.sameDay,       label: `${data.sameDayPct.toFixed(0)}% cash` },
    { color: TIER_COLORS.market1w,      label: `${data.oneWeekPct.toFixed(0)}% market` },
    { color: TIER_COLORS.slow1mo,       label: `${data.oneMonthPct.toFixed(0)}% slow` },
    { color: TIER_COLORS.sixMonthPlus,  label: `${data.sixMonthPlusPct.toFixed(0)}% property` },
    { color: TIER_COLORS.locked,        label: `${data.lockedPct.toFixed(0)}% locked` },
  ];

  return (
    <div style={{ padding: '6px 0 2px' }}>
      <svg viewBox="0 0 320 44" style={{ width: '100%', height: 50, display: 'block' }}>
        {/* Buffer threshold dashed line */}
        <line
          x1={bufferX} y1={2} x2={bufferX} y2={26}
          stroke="var(--text-dim)"
          strokeWidth={0.8}
          strokeDasharray="2 2"
          opacity={0.7}
        />
        <text
          x={bufferX}
          y={42}
          textAnchor="middle"
          fontSize={8.5}
          fill="var(--text-dim)"
          fontFamily="system-ui"
          fontWeight={500}
        >
          {data.liquidBufferPct}% buffer
        </text>

        {/* Tier rects */}
        {rects.map((r, i) => (
          <rect key={i} x={r.x} y={8} width={r.w} height={16} fill={r.color} rx={2} />
        ))}
      </svg>

      {/* Legend row */}
      <div style={{ display: 'flex', gap: 11, flexWrap: 'wrap', marginTop: 6 }}>
        {legendData.map((item, i) => (
          <span
            key={i}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 9,
              color: 'var(--text-faint)',
              fontFamily: 'var(--sans)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: item.color,
                flexShrink: 0,
                display: 'inline-block',
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
