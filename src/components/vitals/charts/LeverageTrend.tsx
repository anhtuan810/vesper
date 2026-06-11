import type { LeverageValue } from '@/lib/vitals/leverage';
import { NL_AVG_LTV_PCT } from '@/lib/vitals/benchmarks';

// Maps an LTV percentage to a y-coordinate in the 78px SVG using the three risk zones.
// Red zone (75–100% LTV): y 0–12  (12px)
// Amber zone (50–75% LTV): y 12–26 (14px)
// Green zone (0–50% LTV):  y 26–76 (50px)
function ltvToY(ltv: number): number {
  const clamped = Math.max(0, Math.min(100, ltv));
  if (clamped >= 75) return Math.max(0, (100 - clamped) / 25 * 12);
  if (clamped >= 50) return 12 + (75 - clamped) / 25 * 14;
  return 26 + (50 - clamped) / 50 * 50;
}

// Maps a date string to an x position across the 320px chart width.
// x=0 is earliest point; x=240 is "today"; x=320 is the end of projection.
function dateToX(date: string, minMs: number, maxMs: number): number {
  const ms = Date.parse(date);
  if (maxMs === minMs) return 240;
  return Math.round(((ms - minMs) / (maxMs - minMs)) * 240);
}

interface Props {
  data: LeverageValue;
}

export function LeverageTrend({ data }: Props) {
  const { ltvPct, trend } = data;

  // Build the visible trend path from historical data + current point
  const hasTrend = trend.length >= 2;

  let pathD = '';
  let todayX = 240;
  let todayY = ltvToY(ltvPct);

  if (hasTrend) {
    const minMs = Date.parse(trend[0].date);
    const maxMs = Date.parse(trend[trend.length - 1].date);
    const points = trend.map(p => ({ x: dateToX(p.date, minMs, maxMs), y: ltvToY(p.ltv) }));
    // Append today at x=240
    points.push({ x: 240, y: todayY });
    todayX = 240;
    pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  } else {
    // Flat baseline — no meaningful trend data
    const flatY = todayY;
    pathD = `M0,${flatY} L240,${flatY}`;
  }

  // Simple linear projection: extrapolate slope from last two trend points
  let projEndY = todayY + 8; // default: slight improvement
  if (hasTrend && trend.length >= 2) {
    const last = trend[trend.length - 1];
    const prev = trend[trend.length - 2];
    const slope = (last.ltv - prev.ltv);
    // Project ~1 year forward (same as the trend period spans)
    projEndY = ltvToY(Math.max(0, ltvPct + slope * 2));
  }

  // Projection area polygon: tapers from today to end with uncertainty band
  const projBandBot = Math.min(76, projEndY + 6);
  const projBandTop = Math.max(0, projEndY - 4);
  const projAreaD = `M${todayX},${todayY} L${todayX + 40},${(todayY + projEndY) / 2 + 1} L320,${projEndY + 2} L320,${projBandBot} L${todayX + 40},${(todayY + projBandBot) / 2} L${todayX},${todayY + 4} Z`;

  const nlAvgY = ltvToY(NL_AVG_LTV_PCT);

  // Timeline labels
  const pastLabel = hasTrend ? trend[0].date.slice(0, 7).replace('-', ' · ').replace('-', '') + ` · ${trend[0].ltv.toFixed(0)}%` : '—';
  const todayLabel = `today · ${ltvPct.toFixed(0)}%`;
  const projYear = (new Date().getFullYear() + 3).toString();
  const projLabel = `${projYear} · ${Math.max(0, ltvPct + (projEndY < todayY ? -10 : 5)).toFixed(0)}%`;

  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox="0 0 320 78" style={{ width: '100%', height: 78, display: 'block' }}>
        {/* Risk zone bands */}
        <rect x={0} y={0}  width={320} height={12} fill="rgba(184,92,74,0.09)" />
        <rect x={0} y={12} width={320} height={14} fill="rgba(196,160,107,0.09)" />
        <rect x={0} y={26} width={320} height={50} fill="rgba(74,124,94,0.06)" />

        {/* Zone labels */}
        <text x={315} y={9}  textAnchor="end" fontSize={8} fill="var(--text-faint)" fontFamily="system-ui">75%</text>
        <text x={315} y={23} textAnchor="end" fontSize={8} fill="var(--text-faint)" fontFamily="system-ui">50%</text>

        {/* NL avg dashed line */}
        <line x1={0} y1={nlAvgY} x2={320} y2={nlAvgY} stroke="var(--text-dim)" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.5} />
        <text x={5} y={nlAvgY - 2} fontSize={8} fill="var(--text-dim)" fontFamily="system-ui" style={{ fontFeatureSettings: "'tnum'" }}>
          NL avg {NL_AVG_LTV_PCT}%
        </text>

        {/* Trend line */}
        <path d={pathD} fill="none" stroke="var(--accent)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />

        {/* Projection area */}
        <path d={projAreaD} fill="var(--accent)" opacity={0.10} />

        {/* Projection dashed line */}
        <path
          d={`M${todayX},${todayY} L${(todayX + 320) / 2},${(todayY + projEndY) / 2} L320,${projEndY}`}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeDasharray="3 3"
          opacity={0.65}
        />

        {/* Today dot */}
        <circle cx={todayX} cy={todayY} r={3.8} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
      </svg>

      {/* Timeline labels below SVG */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontFeatureSettings: "'tnum'",
        }}
      >
        <span style={{ fontSize: 9.5, color: 'var(--text-faint)' }}>{pastLabel}</span>
        <span style={{ fontSize: 9.5, color: 'var(--accent-deep)', fontWeight: 600 }}>{todayLabel}</span>
        <span style={{ fontSize: 9.5, color: 'var(--text-faint)', fontStyle: 'italic' }}>{projLabel}</span>
      </div>
    </div>
  );
}
