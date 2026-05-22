import type { ConcentrationValue } from '@/lib/vitals/concentration';

// Fixed asset-class colors — constant across themes
const ASSET_COLOR: Record<string, string> = {
  real_estate: '#7A9C7F',
  crypto:      '#C47B5A',
  pension:     '#C4A86E',
  cash:        '#888780',
  stocks:      '#6B82A8',
  etf:         '#6B82A8',
  bonds:       '#C4A86E',
  gold:        '#C4A86E',
  other:       '#B4B2A9',
};
const LABEL_COLOR = '#F4F1E8';
const GAP = 2;
const W = 320;
const H = 96;

interface Position {
  name: string;
  pct: number;
  type: string;
}

interface Props {
  data: ConcentrationValue;
  positions: Position[];
}

function colorFor(type: string): string {
  return ASSET_COLOR[type] ?? ASSET_COLOR.other;
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '…' : text;
}

export function ConcentrationTreemap({ positions }: Props) {
  const sorted = [...positions].sort((a, b) => b.pct - a.pct);
  if (sorted.length === 0) return null;

  const topPos = sorted[0];
  const rest = sorted.slice(1);

  // Left panel: proportional width of the top position
  const leftW = Math.max(40, Math.min(W - 20, Math.round((topPos.pct / 100) * W)));
  const rightX = leftW + GAP;
  const rightW = W - rightX;
  const isNarrowRight = rightW < 30;

  // Build right-panel rects
  type RightRect = { x: number; y: number; w: number; h: number; color: string; name: string; pct: number; row: 'top' | 'mid' | 'bot' };
  const rightRects: RightRect[] = [];

  if (rest.length > 0 && rightW >= 4) {
    if (rest.length === 1) {
      rightRects.push({ x: rightX, y: 0, w: rightW, h: H, color: colorFor(rest[0].type), name: rest[0].name, pct: rest[0].pct, row: 'top' });
    } else if (rest.length === 2) {
      const totalPct = rest[0].pct + rest[1].pct || 1;
      const h0 = Math.max(4, Math.round((rest[0].pct / totalPct) * (H - GAP)));
      const h1 = H - h0 - GAP;
      rightRects.push({ x: rightX, y: 0,        w: rightW, h: h0, color: colorFor(rest[0].type), name: rest[0].name, pct: rest[0].pct, row: 'top' });
      rightRects.push({ x: rightX, y: h0 + GAP, w: rightW, h: h1, color: colorFor(rest[1].type), name: rest[1].name, pct: rest[1].pct, row: 'mid' });
    } else {
      // Top two get proportional heights in the upper portion; remainder get bottom row
      const BOT_ROW_H = 20;
      const main = rest.slice(0, 2);
      const small = rest.slice(2);
      const mainTotalPct = main.reduce((s, p) => s + p.pct, 0) || 1;
      const mainAreaH = H - BOT_ROW_H - GAP * 2;
      const h0 = Math.max(4, Math.round((main[0].pct / mainTotalPct) * (mainAreaH - GAP)));
      const h1 = mainAreaH - h0 - GAP;
      rightRects.push({ x: rightX, y: 0,                  w: rightW, h: h0, color: colorFor(main[0].type), name: main[0].name, pct: main[0].pct, row: 'top' });
      rightRects.push({ x: rightX, y: h0 + GAP,           w: rightW, h: h1, color: colorFor(main[1].type), name: main[1].name, pct: main[1].pct, row: 'mid' });
      // Bottom row — split by pct
      const botY = mainAreaH + GAP * 2;
      const totalSmallPct = small.reduce((s, p) => s + p.pct, 0) || 1;
      let curX = rightX;
      small.forEach((p, i) => {
        const isLast = i === small.length - 1;
        const w = isLast ? rightX + rightW - curX : Math.max(4, Math.round((p.pct / totalSmallPct) * (rightW - (small.length - 1) * GAP)));
        rightRects.push({ x: curX, y: botY, w, h: BOT_ROW_H, color: colorFor(p.type), name: p.name, pct: p.pct, row: 'bot' });
        curX += w + GAP;
      });
    }
  }

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: H, display: 'block', borderRadius: 5, overflow: 'hidden' }}
    >
      {/* Left: top position */}
      <rect x={0} y={0} width={leftW} height={H} fill={colorFor(topPos.type)} />
      {leftW >= 30 && (
        <>
          <text x={13} y={22} fontSize={11} fill={LABEL_COLOR} fontWeight={500} fontFamily="system-ui">
            {truncate(topPos.name, leftW < 60 ? 6 : 20)}
          </text>
          <text x={13} y={42} fontSize={leftW < 60 ? 14 : 22} fill={LABEL_COLOR} fontWeight={600} fontFamily="Georgia,serif" style={{ fontFeatureSettings: "'tnum'" }}>
            {topPos.pct.toFixed(0)}%
          </text>
        </>
      )}

      {/* Right panels */}
      {!isNarrowRight && rightRects.map((r, i) => (
        <g key={i}>
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.color} />
          {r.w >= 30 && r.h >= 16 && r.row !== 'bot' && (
            <>
              <text x={r.x + 10} y={r.y + 14} fontSize={10} fill={LABEL_COLOR} fontWeight={500} fontFamily="system-ui">
                {truncate(r.name, Math.floor(r.w / 7))}
              </text>
              <text
                x={r.x + r.w - 6}
                y={r.y + r.h - 8}
                fontSize={r.h >= 28 ? 15 : 11}
                fill={LABEL_COLOR}
                fontWeight={600}
                fontFamily="Georgia,serif"
                textAnchor="end"
                style={{ fontFeatureSettings: "'tnum'" }}
              >
                {r.pct.toFixed(0)}%
              </text>
            </>
          )}
          {r.row === 'bot' && r.w >= 28 && (
            <text x={r.x + r.w / 2} y={r.y + r.h - 6} fontSize={9} fill={LABEL_COLOR} fontWeight={500} fontFamily="system-ui" textAnchor="middle">
              {truncate(r.name, Math.max(3, Math.floor(r.w / 7)))} {r.pct.toFixed(0)}%
            </text>
          )}
        </g>
      ))}

      {/* Narrow right: just color slivers, no labels */}
      {isNarrowRight && rightRects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={Math.max(r.w, 2)} height={r.h} fill={r.color} />
      ))}
    </svg>
  );
}
