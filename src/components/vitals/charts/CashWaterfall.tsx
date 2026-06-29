import type { CashRealYieldValue } from '@/lib/vitals/cashRealYield';

const BASELINE_Y = 48;
const MAX_UP = 40;   // max pixels above baseline (for positive savings)
const MAX_DOWN = 40; // max pixels below baseline (for negatives)

interface Props {
  data: CashRealYieldValue;
}

function fmtPct(v: number): string {
  const sign = v >= 0 ? '+' : '−';
  return `${sign}${Math.abs(v).toFixed(1)}%`;
}

export function CashWaterfall({ data }: Props) {
  const { savingsRatePct, inflationDragPct, box3TaxPct, realYieldPct } = data;

  // Scale so the total downward movement fits in MAX_DOWN px
  const totalDown = inflationDragPct + box3TaxPct;
  const scale = totalDown > 0 ? (MAX_DOWN - 4) / totalDown : 6;

  const savingsH = Math.round(Math.min(savingsRatePct * scale, MAX_UP));
  const inflationH = Math.round(inflationDragPct * scale);
  const taxH = Math.round(box3TaxPct * scale);

  // Y positions for each waterfall step
  const savingsTop = BASELINE_Y - savingsH;     // rect top (goes up)
  const inflationTop = savingsTop;               // starts where savings ended (top)
  const inflationBottom = inflationTop + inflationH;
  const taxTop = inflationBottom;
  const taxBottom = taxTop + taxH;

  // Result box spans from baseline down to the final position
  const resultTop = BASELINE_Y;
  const resultH = taxBottom - BASELINE_Y;
  const resultMidY = resultTop + resultH / 2 + 5;

  // Fixed x positions (from mockup)
  const savingsX = 20;
  const inflationX = 86;
  const taxX = 152;
  const resultX = 226;
  const rectW = 40;
  const resultBoxW = 70;

  return (
    <svg viewBox="0 0 320 96" style={{ width: '100%', height: 96, display: 'block' }}>
      {/* Baseline */}
      <line x1={0} y1={BASELINE_Y} x2={320} y2={BASELINE_Y} stroke="rgba(28,28,24,0.20)" strokeWidth={0.7} />

      {/* Gridlines */}
      <line x1={0} y1={30} x2={320} y2={30} stroke="rgba(28,28,24,0.08)" strokeWidth={0.4} strokeDasharray="1 3" />
      <line x1={0} y1={66} x2={320} y2={66} stroke="rgba(28,28,24,0.08)" strokeWidth={0.4} strokeDasharray="1 3" />

      {/* Savings rect (positive, going up from baseline) */}
      <rect x={savingsX} y={savingsTop} width={rectW} height={savingsH} fill="var(--accent)" opacity={0.88} />
      <text
        x={savingsX + rectW / 2}
        y={savingsTop - 5}
        textAnchor="middle"
        fontSize={12}
        fill="var(--positive-text)"
        fontWeight={600}
        style={{ fontFeatureSettings: "'tnum'" }}
      >
        {fmtPct(savingsRatePct)}
      </text>
      <text x={savingsX + rectW / 2} y={62} textAnchor="middle" fontSize={11} fill="var(--text-faint)">
        savings
      </text>

      {/* Connector: savings top → inflation top */}
      <line
        x1={savingsX + rectW}
        y1={inflationTop}
        x2={inflationX}
        y2={inflationTop}
        stroke="rgba(28,28,24,0.18)"
        strokeWidth={0.7}
        strokeDasharray="2 2"
      />

      {/* Inflation rect (negative, going down from savings top) */}
      <rect x={inflationX} y={inflationTop} width={rectW} height={inflationH} fill="var(--negative)" opacity={0.88} />
      <text
        x={inflationX + rectW / 2}
        y={inflationTop - 5}
        textAnchor="middle"
        fontSize={12}
        fill="var(--negative-text)"
        fontWeight={600}
        style={{ fontFeatureSettings: "'tnum'" }}
      >
        {fmtPct(-inflationDragPct)}
      </text>
      <text x={inflationX + rectW / 2} y={Math.min(92, inflationBottom + 14)} textAnchor="middle" fontSize={11} fill="var(--text-faint)">
        inflation
      </text>

      {/* Connector: inflation bottom → tax top */}
      <line
        x1={inflationX + rectW}
        y1={inflationBottom}
        x2={taxX}
        y2={inflationBottom}
        stroke="rgba(28,28,24,0.18)"
        strokeWidth={0.7}
        strokeDasharray="2 2"
      />

      {/* Tax rect (negative, continuing down) */}
      <rect x={taxX} y={taxTop} width={rectW} height={taxH} fill="var(--negative)" opacity={0.88} />
      <text
        x={taxX + rectW / 2}
        y={taxTop - 5}
        textAnchor="middle"
        fontSize={12}
        fill="var(--negative-text)"
        fontWeight={600}
        style={{ fontFeatureSettings: "'tnum'" }}
      >
        {fmtPct(-box3TaxPct)}
      </text>
      <text x={taxX + rectW / 2} y={Math.min(92, taxBottom + 14)} textAnchor="middle" fontSize={11} fill="var(--text-faint)">
        box 3 tax
      </text>

      {/* Connector: tax bottom → result box */}
      <line
        x1={taxX + rectW}
        y1={taxBottom}
        x2={resultX}
        y2={taxBottom}
        stroke="rgba(28,28,24,0.18)"
        strokeWidth={0.7}
      />

      {/* Result box (dashed outline, no fill) */}
      {resultH > 0 && (
        <>
          <rect
            x={resultX}
            y={resultTop}
            width={resultBoxW}
            height={resultH}
            fill="none"
            stroke="var(--negative-text)"
            strokeWidth={1.5}
            strokeDasharray="3 2"
          />
          <text
            x={resultX + resultBoxW / 2}
            y={resultMidY}
            textAnchor="middle"
            fontSize={13}
            fill="var(--negative-text)"
            fontWeight={700}
            style={{ fontFeatureSettings: "'tnum'" }}
          >
            {fmtPct(realYieldPct)}
          </text>
        </>
      )}
      <text
        x={resultX + resultBoxW / 2}
        y={92}
        textAnchor="middle"
        fontSize={11}
        fill="var(--text-faint)"
        fontWeight={500}
      >
        real yield
      </text>
    </svg>
  );
}
