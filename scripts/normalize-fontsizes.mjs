// One-off codemod: collapse the ad-hoc inline `fontSize` values scattered across
// the app surfaces onto a single small-text ladder (11 / 12 / 13 / 15) and raise
// the readability floor to 11px. Only the noisy 8–15.5px band is touched; heading
// and display sizes (≥16px) are left exactly as they are. Charts, the marketing
// site, and icon/OG generators are excluded — they have their own intentional
// type. Run: node scripts/normalize-fontsizes.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

// Snap a raw px size to the canonical ladder. Returns null to leave untouched.
function mapSize(n) {
  if (n <= 10.5) return 11; // micro / eyebrow labels (was 8–10.5)
  if (n <= 11.5) return 12; // captions, sub-lines
  if (n <= 13.5) return 13; // secondary text, values
  if (n <= 15.5) return 15; // body, list-item titles, emphasis
  return null;              // 16px+ headings/display: keep as authored
}

const EXCLUDE = [
  /\/marketing\//,
  /\/components\/sections\//,
  /\/charts\//,
  /Chart\.tsx$/,
  /MiniSparkline\.tsx$/,
  /opengraph-image\.tsx$/,
  /\/(apple-)?icon\.tsx$/,
];

// Within a single `fontSize:` value expression, remap a bare leading number and
// any quoted "Npx"/'Npx' literal (covers ternaries like a ? "11px" : "9.5px").
function remapExpr(expr) {
  let changed = false;
  // Leading bare numeric value: `fontSize: 13` / `fontSize: 10.5`
  let out = expr.replace(/^(\s*)(\d+(?:\.\d+)?)(\s*)$/, (m, pre, num, post) => {
    const mapped = mapSize(parseFloat(num));
    if (mapped == null || mapped === parseFloat(num)) return m;
    changed = true;
    return `${pre}${mapped}${post}`;
  });
  // Quoted px literals anywhere in the expression.
  out = out.replace(/(['"])(\d+(?:\.\d+)?)px\1/g, (m, q, num) => {
    const mapped = mapSize(parseFloat(num));
    if (mapped == null || mapped === parseFloat(num)) return m;
    changed = true;
    return `${q}${mapped}px${q}`;
  });
  return changed ? out : null;
}

const files = execSync('git ls-files "src/**/*.tsx" "src/**/*.ts"', { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => !EXCLUDE.some((re) => re.test(f)));

let totalEdits = 0;
const touched = [];

for (const file of files) {
  const src = readFileSync(file, "utf8");
  let edits = 0;
  // Capture each `fontSize:` value up to the first top-level comma / brace / newline.
  const next = src.replace(/(\bfontSize:\s*)([^,}\n]+)/g, (full, key, expr) => {
    const remapped = remapExpr(expr);
    if (remapped == null) return full;
    edits++;
    return `${key}${remapped}`;
  });
  if (edits > 0) {
    writeFileSync(file, next);
    totalEdits += edits;
    touched.push(`${file} (${edits})`);
  }
}

console.log(`Rewrote ${totalEdits} fontSize values across ${touched.length} files:`);
for (const t of touched) console.log("  " + t);
