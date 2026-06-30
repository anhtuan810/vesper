import type { RealGrowthValue } from '@/lib/vitals/realGrowth';

const W = 320;
const Y_TOP = 10;
const Y_BOT = 72;   // chart plot area bottom (labels below)
const Y_RANGE = Y_BOT - Y_TOP;

interface Props {
  data: RealGrowthValue;
}

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}

export function RealGrowthDualLine({ data }: Props) {
  const { series } = data;

  // Fallback: if not enough series data, render a minimal flat chart
  if (series.length < 2) {
    return (
      <svg viewBox="0 0 320 86" style={{ width: '100%', height: 86, display: 'block' }}>
        <defs>
          <linearGradient id="rgg3" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={0} y1={64} x2={W} y2={64} stroke="var(--border)" strokeWidth={0.5} strokeDasharray="2 3" />
        <line x1={0} y1={40} x2={W} y2={40} stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" />
        <line x1={0} y1={40} x2={W} y2={40} stroke="var(--text-dim)" strokeWidth={1.4} strokeDasharray="4 3" strokeLinecap="round" />
        <circle cx={W} cy={40} r={3.8} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
        <circle cx={W} cy={40} r={3.2} fill="var(--text-dim)" stroke="var(--surface)" strokeWidth={1.5} />
        <text x={0} y={82} fontSize={11} fill="var(--text-faint)">—</text>
        <text x={W} y={82} textAnchor="end" fontSize={11} fill="var(--text-faint)">today</text>
      </svg>
    );
  }

  // Compute y-axis range from all values in the series
  const allValues = series.flatMap(p => [p.nominal, p.real]);
  const minV = Math.min(...allValues);
  const maxV = Math.max(...allValues);
  const valueRange = maxV - minV || 1;
  // Add 8% padding at top and bottom
  const paddedMin = minV - valueRange * 0.08;
  const paddedMax = maxV + valueRange * 0.08;
  const paddedRange = paddedMax - paddedMin;

  function valueToY(v: number): number {
    return Y_BOT - ((v - paddedMin) / paddedRange) * Y_RANGE;
  }

  // Map series index to x position
  const n = series.length;
  function indexToX(i: number): number {
    return Math.round((i / (n - 1)) * W);
  }

  // Build path strings
  const nomPoints = series.map((p, i) => ({ x: indexToX(i), y: valueToY(p.nominal) }));
  const realPoints = series.map((p, i) => ({ x: indexToX(i), y: valueToY(p.real) }));

  const nomPath = nomPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y.toFixed(1)}`).join(' ');
  const realPath = realPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y.toFixed(1)}`).join(' ');

  // Gradient fill area: nominal path + right edge + bottom + left edge close
  const areaPath = nomPath + ` L${W},86 L0,86 Z`;

  const nomEndX = nomPoints[n - 1].x;
  const nomEndY = nomPoints[n - 1].y;
  const realEndX = realPoints[n - 1].x;
  const realEndY = realPoints[n - 1].y;

  // Today gridline at 3/4 of the chart width (approximate "today" position for 12-month series)
  const todayX = Math.round(W * 0.75);

  // Date labels
  const startLabel = series.length > 0 ? formatDateLabel(series[0].date) : '';
  const midLabel = series.length > 2 ? formatDateLabel(series[Math.floor(series.length / 2)].date) : '';

  return (
    <svg viewBox="0 0 320 86" style={{ width: '100%', height: 86, display: 'block' }}>
      <defs>
        <linearGradient id="rgg3" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.16} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
        </linearGradient>
      </defs>

      {/* Today gridline */}
      <line
        x1={todayX} y1={Y_TOP}
        x2={todayX} y2={Y_BOT}
        stroke="var(--border)"
        strokeWidth={0.5}
        strokeDasharray="2 3"
      />

      {/* Nominal area fill */}
      <path d={areaPath} fill="url(#rgg3)" />

      {/* Nominal line */}
      <path d={nomPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

      {/* Real line (dashed) */}
      <path d={realPath} fill="none" stroke="var(--text-dim)" strokeWidth={1.4} strokeDasharray="4 3" strokeLinecap="round" strokeLinejoin="round" />

      {/* End-point dots */}
      <circle cx={nomEndX} cy={nomEndY} r={3.8} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
      <circle cx={realEndX} cy={realEndY} r={3.2} fill="var(--text-dim)" stroke="var(--surface)" strokeWidth={1.5} />

      {/* Pill labels near right edge */}
      <rect x={262} y={9} width={48} height={13} rx={6.5} fill="var(--surface-elev)" />
      <text x={286} y={18} textAnchor="middle" fontSize={11} fill="var(--accent-deep)" fontWeight={600}>
        nominal
      </text>

      <rect x={262} y={33} width={48} height={13} rx={6.5} fill="var(--surface-elev)" />
      <text x={286} y={42} textAnchor="middle" fontSize={11} fill="var(--text-dim)" fontWeight={500}>
        real
      </text>

      {/* Date labels */}
      <text x={0}   y={82} fontSize={11} fill="var(--text-faint)">{startLabel}</text>
      {midLabel && (
        <text x={W / 2} y={82} textAnchor="middle" fontSize={11} fill="var(--text-faint)">{midLabel}</text>
      )}
      <text x={W}   y={82} textAnchor="end" fontSize={11} fill="var(--text-faint)">today</text>
    </svg>
  );
}
