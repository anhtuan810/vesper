import type { RealAssetWeightValue } from '@/lib/vitals/realAssetWeight';

// Fixed percentile band colors — constant across themes
const BANDS = [
  { x: 0,   width: 60,  fill: '#E8E2D4', pctStart: 0,  pctEnd: 25 },
  { x: 60,  width: 80,  fill: '#D9D2C0', pctStart: 25, pctEnd: 50 },
  { x: 140, width: 80,  fill: '#CBC3AC', pctStart: 50, pctEnd: 75 },
  { x: 220, width: 60,  fill: '#BDB498', pctStart: 75, pctEnd: 90 },
  { x: 280, width: 40,  fill: '#A89F84', pctStart: 90, pctEnd: 100 },
];

// Maps a percentile (0–100) to an x pixel position using the band widths (linear within each band)
function percentileToX(pct: number): number {
  const clamped = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < BANDS.length; i++) {
    const b = BANDS[i];
    if (clamped <= b.pctEnd) {
      const t = (clamped - b.pctStart) / (b.pctEnd - b.pctStart);
      return b.x + t * b.width;
    }
  }
  return 320;
}

// EU median is defined as the 50th percentile of EU homeowners
const EU_MEDIAN_X = percentileToX(50); // = 140

interface Props {
  data: RealAssetWeightValue;
}

export function RealAssetBullet({ data }: Props) {
  const barW = Math.max(0, Math.min(320, percentileToX(data.percentileEU)));
  const dotX = barW;

  return (
    <div style={{ padding: '8px 0 4px' }}>
      <svg
        viewBox="0 0 320 44"
        style={{ width: '100%', height: 50, display: 'block' }}
      >
        {/* Percentile bands */}
        {BANDS.map((b) => (
          <rect key={b.x} x={b.x} y={14} width={b.width} height={18} fill={b.fill} />
        ))}

        {/* Tick marks at band boundaries */}
        {[60, 140, 220, 280].map((x) => (
          <line key={x} x1={x} y1={32} x2={x} y2={35} stroke="var(--text-faint)" strokeWidth={0.7} />
        ))}

        {/* Percentile labels */}
        <text x={60}  y={43} textAnchor="middle" fontSize={11} fill="var(--text-faint)">25th</text>
        <text x={140} y={43} textAnchor="middle" fontSize={11} fill="var(--text-faint)" fontWeight={500}>median</text>
        <text x={220} y={43} textAnchor="middle" fontSize={11} fill="var(--text-faint)">75th</text>
        <text x={280} y={43} textAnchor="middle" fontSize={11} fill="var(--text-faint)">90th</text>

        {/* Your position bar */}
        <rect x={0} y={19} width={barW} height={8} fill="var(--accent)" />

        {/* EU median marker */}
        <line x1={EU_MEDIAN_X} y1={8} x2={EU_MEDIAN_X} y2={34} stroke="var(--hero)" strokeWidth={1.6} />
        <text
          x={EU_MEDIAN_X}
          y={6}
          textAnchor="middle"
          fontSize={11}
          fill="var(--hero)"
          fontWeight={600}
          className="tnum"
        >
          EU median 63%
        </text>

        {/* Your position dot */}
        <circle cx={dotX} cy={23} r={3.8} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
      </svg>
    </div>
  );
}
