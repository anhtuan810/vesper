import type { LiquidityPostureValue } from '@/lib/vitals/liquidityPosture';

// A deliberately muted liquidity-tier palette — these tiers aren't asset
// categories, and the --cat-* tokens read more saturated than this quiet ramp
// intends. Each tier is its nearest token softened over the surface, so the
// muted read survives theme switches (the old fixed light-theme literals went
// washed-out/invisible on the dark surface). sameDay stays the brand accent.
const TIER_COLORS = {
  sameDay:      'var(--accent)',
  market1w:     'color-mix(in srgb, var(--cat-markets) 72%, var(--surface))',
  slow1mo:      'color-mix(in srgb, var(--accent) 62%, var(--surface))',
  sixMonthPlus: 'color-mix(in srgb, var(--cat-reserves) 78%, var(--surface))',
  locked:       'color-mix(in srgb, var(--text) 42%, var(--surface))',
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

  // Compute widths proportionally; distribute rounding to last rect.
  // Zero-percent tiers take no space (and no gap), and the last rect is clamped
  // to >= 0 so the min-width floors on tiny tiers can never overflow TOTAL_W and
  // produce a negative width.
  let curX = 0;
  const rects = tiers.map((t, i) => {
    const isLast = i === tiers.length - 1;
    const w = isLast
      ? Math.max(0, TOTAL_W - curX)
      : t.pct > 0
        ? Math.max(2, Math.round((t.pct / totalPct) * RECT_AREA))
        : 0;
    const rect = { x: curX, w, color: t.color };
    curX += w > 0 && !isLast ? w + GAP : w;
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
          fontSize={11}
          fill="var(--text-dim)"
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
      <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
        {legendData.map((item, i) => (
          <span
            key={i}
            className="tnum"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 'var(--fs-caption)',
              color: 'var(--text-faint)',
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
