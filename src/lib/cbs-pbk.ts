// CBS PBK (Prijsindex Bestaande Koopwoningen) client for table 85792NED — the
// regional house-price index, base 2020 = 100. Deterministic, server-side only,
// NO LLM. Resolves the dynamic identifiers (RegioS code, measure code, periods)
// from the table's own coded-value lists at RUNTIME — never hardcoded. Every
// step fails gracefully: any fetch error, lookup miss, or shape mismatch returns
// null and the caller surfaces { available: false }. Never throws.

import { createServerSupabase } from "@/lib/supabase";
import type { IndexPoint } from "@/lib/property-estimate";

// ── CBS CONFIG — the single live-verify point ────────────────────────────────
// OData4 is preferred; the legacy OData endpoint is the fallback. Only URL shapes
// and human-readable match patterns live here — the actual RegioS / measure codes
// and the latest period are resolved at runtime. ⚠ Verify on device against the
// live service (endpoint names, the measure title, and the yearly period format).
const CBS = {
  odata4: "https://datasets.cbs.nl/odata/v1/CBS/85792NED",
  legacy: "https://opendata.cbs.nl/ODataApi/odata/85792NED",
  // The PBK index measure — matched by its title, then resolved to its code/key.
  measureMatch: /prijsindex bestaande koopwoningen/i,
  // Cities that have their own RegioS code; everything else uses the province.
  bigCities: ["Amsterdam", "Rotterdam", "'s-Gravenhage", "Utrecht"],
  // CBS yearly period identifier, e.g. "2024JJ00" (JJ = whole year).
  yearlyPeriod: /^(\d{4})JJ\d{2}$/,
  timeoutMs: 8000,
  cacheTtlDays: 30,
};

export interface RegionIndex {
  regionCode: string;
  points: IndexPoint[];
  asOfPeriod: string; // latest yearly period id used, e.g. "2024JJ00"
}

const norm = (s: unknown): string => String(s ?? "").trim().toLowerCase();

async function fetchJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(CBS.timeoutMs),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function listOf(data: unknown): Record<string, unknown>[] | null {
  const v = (data as { value?: unknown } | null)?.value;
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : null;
}

// Which CBS region name to use: the city if it's one of the big four, else province.
export function targetRegionName(gemeente: string | null, province: string | null): string | null {
  const g = (gemeente || "").trim();
  if (g && CBS.bigCities.some((c) => norm(c) === norm(g))) return g;
  const p = (province || "").trim();
  return p || null;
}

// Build a yearly IndexPoint[] from raw {period, value} rows (yearly periods only).
function buildRegionIndex(
  regionCode: string,
  rows: Array<{ period: unknown; value: unknown }>,
): RegionIndex | null {
  const byYear = new Map<number, number>();
  let latestPeriod = "";
  for (const row of rows) {
    const period = String(row.period ?? "").trim();
    const m = CBS.yearlyPeriod.exec(period);
    if (!m) continue;
    const year = Number(m[1]);
    const value = typeof row.value === "number" ? row.value : Number(row.value);
    if (!Number.isFinite(year) || !Number.isFinite(value) || value <= 0) continue;
    byYear.set(year, value);
    if (period > latestPeriod) latestPeriod = period;
  }
  if (byYear.size === 0) return null;
  const points: IndexPoint[] = [...byYear.entries()]
    .map(([year, index]) => ({ year, index }))
    .sort((a, b) => a.year - b.year);
  return { regionCode, points, asOfPeriod: latestPeriod };
}

// ── OData4 (preferred) ───────────────────────────────────────────────────────
async function resolveRegionCode4(name: string): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.odata4}/RegioS`));
  if (!list) return null;
  const m = list.find((r) => norm(r.Title) === norm(name));
  return typeof m?.Identifier === "string" && m.Identifier ? m.Identifier : null;
}

async function resolveMeasureCode4(): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.odata4}/MeasureCodes`));
  if (!list) return null;
  const m = list.find((x) => CBS.measureMatch.test(String(x.Title ?? "")));
  return typeof m?.Identifier === "string" && m.Identifier ? m.Identifier : null;
}

async function fetchSeries4(regionCode: string, measureCode: string): Promise<RegionIndex | null> {
  const filter = `RegioS eq '${regionCode}' and Measure eq '${measureCode}'`;
  const url = `${CBS.odata4}/Observations?$select=Perioden,Value&$filter=${encodeURIComponent(filter)}`;
  const list = listOf(await fetchJson(url));
  if (!list) return null;
  return buildRegionIndex(regionCode, list.map((r) => ({ period: r.Perioden, value: r.Value })));
}

// ── Legacy OData (fallback) ──────────────────────────────────────────────────
async function resolveRegionKeyLegacy(name: string): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.legacy}/RegioS`));
  if (!list) return null;
  const m = list.find((r) => norm(r.Title) === norm(name));
  return typeof m?.Key === "string" && m.Key ? m.Key : null;
}

async function resolveMeasureKeyLegacy(): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.legacy}/DataProperties`));
  if (!list) return null;
  const m = list.find((x) => CBS.measureMatch.test(String(x.Title ?? "")));
  return typeof m?.Key === "string" && m.Key ? m.Key : null;
}

async function fetchSeriesLegacy(regionKey: string, measureKey: string): Promise<RegionIndex | null> {
  const filter = `(RegioS eq '${regionKey}')`;
  const url = `${CBS.legacy}/TypedDataSet?$select=${encodeURIComponent(`Perioden,${measureKey}`)}&$filter=${encodeURIComponent(filter)}`;
  const list = listOf(await fetchJson(url));
  if (!list) return null;
  return buildRegionIndex(regionKey, list.map((r) => ({ period: r.Perioden, value: r[measureKey] })));
}

// ── Cache (best-effort) ──────────────────────────────────────────────────────
// Assumed schema: price_index_cache(region_code text primary key, points jsonb,
// as_of_period text, fetched_at timestamptz). Read/write wrapped so a cache miss
// (or missing table) degrades to a live fetch — never an error.
async function readCache(regionCode: string): Promise<RegionIndex | null> {
  try {
    const supabase = createServerSupabase();
    const { data } = await supabase
      .from("price_index_cache")
      .select("points, as_of_period, fetched_at")
      .eq("region_code", regionCode)
      .maybeSingle();
    if (!data?.fetched_at) return null;
    const ageDays = (Date.now() - new Date(data.fetched_at as string).getTime()) / 86_400_000;
    const points = data.points as IndexPoint[] | null;
    if (ageDays <= CBS.cacheTtlDays && Array.isArray(points) && points.length > 0) {
      return { regionCode, points, asOfPeriod: (data.as_of_period as string) ?? "" };
    }
  } catch {
    /* degrade to live fetch */
  }
  return null;
}

async function writeCache(r: RegionIndex): Promise<void> {
  try {
    const supabase = createServerSupabase();
    await supabase.from("price_index_cache").upsert(
      {
        region_code: r.regionCode,
        points: r.points,
        as_of_period: r.asOfPeriod,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "region_code" },
    );
  } catch {
    /* best-effort */
  }
}

// ── Public entry — deterministic, server-side only ───────────────────────────
// Returns the cached-or-fetched yearly index series for the property's region, or
// null on any failure (the caller maps null → { available: false }).
export async function getRegionIndex(
  gemeente: string | null,
  province: string | null,
): Promise<RegionIndex | null> {
  const name = targetRegionName(gemeente, province);
  if (!name) return null;

  // OData4 first.
  const code4 = await resolveRegionCode4(name);
  if (code4) {
    const cached = await readCache(code4);
    if (cached) return cached;
    const measure = await resolveMeasureCode4();
    if (measure) {
      const series = await fetchSeries4(code4, measure);
      if (series) {
        await writeCache(series);
        return series;
      }
    }
  }

  // Legacy fallback.
  const keyL = await resolveRegionKeyLegacy(name);
  if (keyL) {
    const cached = await readCache(keyL);
    if (cached) return cached;
    const measureL = await resolveMeasureKeyLegacy();
    if (measureL) {
      const seriesL = await fetchSeriesLegacy(keyL, measureL);
      if (seriesL) {
        await writeCache(seriesL);
        return seriesL;
      }
    }
  }

  return null;
}
