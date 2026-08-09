// Guards the Eurostat JSON-stat parser for the national house-price index
// (src/lib/national-price-index.ts). Run: npx tsx scripts/verify-national-price-index.ts
// Exits non-zero on any mismatch. No framework, no network — a hand-built
// fixture shaped exactly like Eurostat's prc_hpi_a JSON-stat 2.0 response.
//
// This is the country-level tier of the property reconstruction: a single
// dataset that gives EVERY country a market-shaped history line (replacing
// "NL via CBS, everyone else linear"), pre-seeded by a cron so the net-worth
// rebuild never fetches it live. The parser only has to survive a real payload
// shape — geo/time as the varying dimensions, other dims pinned, sparse/missing
// cells, aggregate geos (EU, EA) excluded, and the EL→GR / UK→GB code quirks.

import { parseEurostatHpi } from "../src/lib/national-price-index";

let failures = 0;
function check(label: string, cond: boolean, detail = "") {
  if (!cond) failures++;
  console.log(`  [${cond ? "PASS" : "FAIL"}] ${label}${detail ? `  — ${detail}` : ""}`);
}

// Minimal JSON-stat 2.0 fixture: dims [freq, purchase, unit, geo, time], only
// geo (4 values, incl. an aggregate) and time (3 years) actually vary — the
// others are pinned singletons, exactly like a filtered Eurostat query. Row-major
// flat index = ((( (freq*P + purchase)*U + unit )*G + geo )*T + time).
// freq=1, purchase=1, unit=1 (all pinned), geo=4, time=3 → size [1,1,1,4,3].
const size = [1, 1, 1, 4, 3];
const geoIndex = { EU27_2020: 0, NL: 1, DE: 2, EL: 3 };
const timeIndex = { "2022": 0, "2023": 1, "2024": 2 };
// flat(geo, time) = geo*3 + time (since freq/purchase/unit strides collapse to 1×T).
const flat = (g: number, t: number) => g * 3 + t;

const value: Record<string, number> = {
  // EU aggregate (index 0) — present but must be excluded from the output.
  [flat(0, 0)]: 110, [flat(0, 1)]: 115, [flat(0, 2)]: 120,
  // NL (index 1) — full series.
  [flat(1, 0)]: 130, [flat(1, 1)]: 140, [flat(1, 2)]: 150,
  // DE (index 2) — one missing cell (2023, sparse — a real gap in coverage).
  [flat(2, 0)]: 105, [flat(2, 2)]: 112,
  // EL (index 3) — Eurostat's Greece code; must map to ISO-2 "GR".
  [flat(3, 0)]: 90, [flat(3, 1)]: 95, [flat(3, 2)]: 101,
};

const fixture = {
  id: ["freq", "purchase", "unit", "geo", "time"],
  size,
  value,
  dimension: {
    geo: { category: { index: geoIndex } },
    time: { category: { index: timeIndex } },
  },
};

console.log("Eurostat JSON-stat parsing:");
const parsed = parseEurostatHpi(fixture);

check("excludes the EU aggregate geo", !("EU27_2020" in parsed));
check("parses NL with all 3 years", parsed.NL?.length === 3, JSON.stringify(parsed.NL));
check("NL points are ascending by year with correct values", JSON.stringify(parsed.NL) === JSON.stringify([
  { year: 2022, index: 130 }, { year: 2023, index: 140 }, { year: 2024, index: 150 },
]), JSON.stringify(parsed.NL));

check("DE has only the 2 non-missing years (sparse cell skipped)", parsed.DE?.length === 2, JSON.stringify(parsed.DE));
check("DE skips the missing 2023 cell, not zero-fills it", parsed.DE?.every((p) => p.year !== 2023) ?? false);

check("EL is remapped to ISO-2 GR", parsed.GR != null && parsed.EL == null, JSON.stringify(Object.keys(parsed)));
check("GR series is complete and correctly valued", JSON.stringify(parsed.GR) === JSON.stringify([
  { year: 2022, index: 90 }, { year: 2023, index: 95 }, { year: 2024, index: 101 },
]));

console.log("\nMalformed payloads degrade to empty (never throw):");
check("null → {}", Object.keys(parseEurostatHpi(null)).length === 0);
check("empty object → {}", Object.keys(parseEurostatHpi({})).length === 0);
check("missing dimension → {}", Object.keys(parseEurostatHpi({ id: ["geo"], size: [1], value: {} })).length === 0);
check("mismatched id/size lengths → {}", Object.keys(parseEurostatHpi({ id: ["geo", "time"], size: [1], value: {} })).length === 0);
check("garbage string → {}", Object.keys(parseEurostatHpi("not json-stat")).length === 0);

console.log("\nA country with zero valid cells is omitted, not an empty array:");
const zeroed = parseEurostatHpi({
  id: ["geo", "time"],
  size: [1, 2],
  value: { "0": 0, "1": -5 }, // non-positive index values, both filtered
  dimension: {
    geo: { category: { index: { XX: 0 } } },
    time: { category: { index: { "2022": 0, "2023": 1 } } },
  },
});
check("no entry for a country whose every value is non-positive", !("XX" in zeroed), JSON.stringify(zeroed));

console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) FAILED.`}`);
process.exit(failures === 0 ? 0 : 1);
