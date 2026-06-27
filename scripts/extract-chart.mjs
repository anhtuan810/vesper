// Regenerates src/components/overview/chartGeometry.ts from the approved
// Overview mockup (docs/design/volnar-app.html). The chart's stacked-area bands
// are long precomputed point strings; extracting them mechanically guarantees a
// pixel-faithful port with no hand-transcription drift.
//
//   node scripts/extract-chart.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "docs/design/volnar-app.html"), "utf8");

// Isolate the net-worth chart SVG.
const svg = html.match(/<svg class="nw"[\s\S]*?<\/svg>/)[0];

// 4 stacked-area polygons (render order = stacking order, bottom to top).
const areas = [...svg.matchAll(/<polygon class="ab" fill="(#[0-9A-Fa-f]{6})" points="([^"]+)"/g)].map(
  (m) => ({ fill: m[1], points: m[2].trim() }),
);

// Net-worth total line.
const totln = svg.match(/<polyline class="totln" points="([^"]+)"/)[1].trim();

// One marker per journal entry (data-i, cx, cy).
const markers = [...svg.matchAll(/<circle class="mk" data-i="(\d+)" cx="([\d.]+)" cy="([\d.]+)"/g)].map(
  (m) => ({ i: Number(m[1]), x: Number(m[2]), y: Number(m[3]) }),
);

// Horizontal gridlines + their right-aligned y-axis labels (paired in source order).
const gridLines = [...svg.matchAll(/<line class="g" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"\/>/g)].map(
  (m) => ({ x1: Number(m[1]), y: Number(m[2]), x2: Number(m[3]) }),
);
const yLabels = [...svg.matchAll(/<text class="yl" x="([\d.]+)" y="([\d.]+)" text-anchor="end">([^<]+)<\/text>/g)].map(
  (m) => ({ x: Number(m[1]), y: Number(m[2]), text: m[3] }),
);
const grid = gridLines.map((g, idx) => ({ ...g, label: yLabels[idx] }));

// X-axis year labels.
const xLabels = [...svg.matchAll(/<text class="xl" x="([\d.]+)" y="([\d.]+)" text-anchor="(\w+)">([^<]+)<\/text>/g)].map(
  (m) => ({ x: Number(m[1]), y: Number(m[2]), anchor: m[3], text: m[4] }),
);

const out = `// AUTO-GENERATED — presentational SVG geometry copied verbatim from the
// approved mockup (docs/design/volnar-app.html). These are pixel coordinates
// inside the chart's 0 0 980 300 viewBox, not bindable portfolio data: the
// stacked-area bands, the net-worth line, the per-entry markers, and the axis
// ticks. Do not hand-edit; re-run scripts/extract-chart.mjs if the chart shape
// changes.

export type Area = { fill: string; points: string };
export type Marker = { i: number; x: number; y: number };
export type GridLine = { x1: number; x2: number; y: number; label: { x: number; y: number; text: string } };
export type XLabel = { x: number; y: number; anchor: string; text: string };

// Stacked bands, bottom-to-top: Property, Reserves, Crypto, Public markets.
export const AREAS: Area[] = ${JSON.stringify(areas, null, 2)};

export const TOTAL_LINE = ${JSON.stringify(totln)};

export const MARKERS: Marker[] = ${JSON.stringify(markers, null, 2)};

export const GRID: GridLine[] = ${JSON.stringify(grid, null, 2)};

export const X_LABELS: XLabel[] = ${JSON.stringify(xLabels, null, 2)};
`;

writeFileSync(resolve(root, "src/components/overview/chartGeometry.ts"), out);
console.log(`areas=${areas.length} markers=${markers.length} grid=${grid.length} xlabels=${xLabels.length}`);
