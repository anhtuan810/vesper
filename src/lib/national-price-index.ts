// National house-price index (Eurostat prc_hpi_a: annual House Price Index, all
// dwellings, index 2015 = 100) — one yearly series per country, cached globally in
// `national_price_index` and seeded by the warm-price-index cron.
//
// This is the country-level tier of the property reconstruction: given a
// property's COUNTRY (no geocoding), it supplies the yearly index shape used to
// bend the buy→today line, for EVERY country Eurostat covers — replacing the old
// "NL via CBS, everyone else linear" split. It never fetches on the read path;
// `getNationalIndex` reads the pre-seeded table, so the net-worth rebuild stays
// pure/local. Every failure degrades to null → the caller's linear fallback, so
// this is safe before the migration is applied or the cron has ever run.
//
// The parser is pure (JSON-stat 2.0) so scripts/verify-national-price-index.ts can
// exercise it without network.

import { createServerSupabase } from "@/lib/supabase";
import type { IndexPoint } from "@/lib/property-estimate";

// Eurostat's `geo` codes are ISO-2 except for a couple of historical quirks; map
// those to the ISO-2 codes the app stores. Everything else passes through.
const EUROSTAT_GEO_TO_ISO2: Record<string, string> = { EL: "GR", UK: "GB" };
// Eurostat aggregate geos that are not single countries — never stored.
const EUROSTAT_AGGREGATES = new Set(["EA", "EU", "EU27_2020", "EU28", "EA19", "EA20"]);

const EUROSTAT_HPI_URL =
  "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/prc_hpi_a" +
  "?format=JSON&lang=EN&freq=A&purchase=TOTAL&unit=I15_A_AVG";

interface JsonStat {
  id?: string[];
  size?: number[];
  value?: Record<string, number> | number[] | null;
  dimension?: Record<string, { category?: { index?: Record<string, number> } }>;
}

// Row-major strides for a JSON-stat dataset: stride[i] is how many flat cells one
// step along dimension i spans. flatIndex = Σ coord[i] * stride[i].
function strides(size: number[]): number[] {
  const s = new Array(size.length).fill(1);
  for (let i = size.length - 2; i >= 0; i--) s[i] = s[i + 1] * size[i + 1];
  return s;
}

// Parse the Eurostat prc_hpi_a JSON-stat payload into per-country yearly index
// points (ISO-2 keyed). Pure — no I/O. Unknown/aggregate geos and non-finite
// cells are skipped; a malformed payload yields {}.
export function parseEurostatHpi(json: unknown): Record<string, IndexPoint[]> {
  const out: Record<string, IndexPoint[]> = {};
  try {
    const ds = json as JsonStat;
    const id = ds.id, size = ds.size, value = ds.value, dim = ds.dimension;
    if (!Array.isArray(id) || !Array.isArray(size) || !value || !dim) return out;
    if (id.length !== size.length) return out;

    const geoIdx = dim.geo?.category?.index;
    const timeIdx = dim.time?.category?.index;
    if (!geoIdx || !timeIdx) return out;

    const st = strides(size);
    const posOf: Record<string, number> = {};
    id.forEach((d, i) => { posOf[d] = i; });
    const geoPos = posOf["geo"], timePos = posOf["time"];
    if (geoPos == null || timePos == null) return out;

    const cellAt = (flat: number): number | undefined => {
      const v = Array.isArray(value) ? value[flat] : (value as Record<string, number>)[String(flat)];
      return typeof v === "number" && Number.isFinite(v) ? v : undefined;
    };

    for (const [geoCode, gi] of Object.entries(geoIdx)) {
      if (EUROSTAT_AGGREGATES.has(geoCode)) continue;
      const iso2 = EUROSTAT_GEO_TO_ISO2[geoCode] ?? geoCode;
      if (!/^[A-Z]{2}$/.test(iso2)) continue;
      const points: IndexPoint[] = [];
      for (const [period, ti] of Object.entries(timeIdx)) {
        const year = parseInt(period.slice(0, 4), 10);
        if (!Number.isFinite(year)) continue;
        // Only geo and time vary; every other dimension is pinned at index 0.
        const flat = (gi as number) * st[geoPos] + (ti as number) * st[timePos];
        const idx = cellAt(flat);
        if (idx != null && idx > 0) points.push({ year, index: idx });
      }
      if (points.length > 0) {
        points.sort((a, b) => a.year - b.year);
        out[iso2] = points;
      }
    }
  } catch {
    /* malformed payload → empty */
  }
  return out;
}

// Warm-instance memo (success-only): a national series is stable far beyond a
// server instance's life, and one rebuild values several properties. Mirrors the
// CBS/region memos. `null` sentinel is NOT cached, so a pre-seed miss re-checks.
const nationalIndexMemo = new Map<string, IndexPoint[]>();

// Read the cached national index for an ISO-2 country. Reads only — never fetches
// (the cron owns fetching). Returns null on any miss/error → linear fallback.
export async function getNationalIndex(countryIso2: string | null | undefined): Promise<IndexPoint[] | null> {
  const code = (countryIso2 || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return null;
  const memoized = nationalIndexMemo.get(code);
  if (memoized) return memoized;
  try {
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from("national_price_index")
      .select("points")
      .eq("country", code)
      .maybeSingle();
    const points = data?.points as IndexPoint[] | null;
    if (Array.isArray(points) && points.length > 0) {
      nationalIndexMemo.set(code, points);
      return points;
    }
  } catch {
    /* degrade to linear */
  }
  return null;
}

// Fetch Eurostat's annual HPI for every country and upsert the table. Called by
// the warm-price-index cron (in production, where the network is open). Never
// throws — returns a status summary for the cron log. Immutable per year, so a
// re-seed just refreshes the latest year(s).
export async function seedNationalPriceIndex(): Promise<{ ok: boolean; countries: number; detail?: string }> {
  try {
    const res = await fetch(EUROSTAT_HPI_URL, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, countries: 0, detail: `eurostat ${res.status}` };
    const parsed = parseEurostatHpi(await res.json());
    const codes = Object.keys(parsed);
    if (codes.length === 0) return { ok: false, countries: 0, detail: "no series parsed" };

    const supabase = createServerSupabase();
    const now = new Date().toISOString();
    const rows = codes.map((country) => ({
      country,
      points: parsed[country],
      as_of_year: parsed[country][parsed[country].length - 1]?.year ?? null,
      fetched_at: now,
    }));
    const { error } = await supabase.from("national_price_index").upsert(rows, { onConflict: "country" });
    if (error) return { ok: false, countries: 0, detail: `upsert ${error.message}` };
    // Refresh any warmed memo so a long-lived instance picks up new data.
    nationalIndexMemo.clear();
    return { ok: true, countries: codes.length };
  } catch (err) {
    return { ok: false, countries: 0, detail: err instanceof Error ? err.message : "error" };
  }
}
