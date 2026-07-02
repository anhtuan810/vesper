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
  // The PBK measure published by 85792NED is titled "Prijsindex verkoopprijzen".
  // It is NOT the table-title group header "Prijsindex bestaande koopwoningen",
  // which is an empty-Key group row — match the measure, not the header.
  measureMatch: /prijsindex\s+verkoopprijzen/i,
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

// CBS RegioS Titles carry a trailing group marker, e.g. "Noord-Brabant (PV)",
// "Amsterdam (GM)", "Nederland (LD)". Strip that suffix (and surrounding space)
// before comparing to the chosen region name.
const stripGroupMarker = (title: unknown): string =>
  String(title ?? "").replace(/\s*\([A-Za-z]{1,4}\)\s*$/, "").trim();

// Match a RegioS Title to a region name, ignoring the group marker and case.
const regionTitleMatches = (title: unknown, name: string): boolean =>
  norm(stripGroupMarker(title)) === norm(name);

// A measure row is the real PBK measure only when it both matches the title regex
// AND has a non-empty code (Identifier for v4, Key for legacy). The group header
// "Prijsindex bestaande koopwoningen" has an empty Key and must be skipped.
const hasCode = (x: Record<string, unknown>): boolean =>
  (typeof x.Identifier === "string" && x.Identifier !== "") ||
  (typeof x.Key === "string" && x.Key !== "");

const isMeasureRow = (x: Record<string, unknown>): boolean =>
  CBS.measureMatch.test(String(x.Title ?? "")) && hasCode(x);

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
  const m = list.find((r) => regionTitleMatches(r.Title, name));
  return typeof m?.Identifier === "string" && m.Identifier ? m.Identifier : null;
}

async function resolveMeasureCode4(): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.odata4}/MeasureCodes`));
  if (!list) return null;
  const m = list.find(isMeasureRow);
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
  const m = list.find((r) => regionTitleMatches(r.Title, name));
  return typeof m?.Key === "string" && m.Key ? m.Key : null;
}

async function resolveMeasureKeyLegacy(): Promise<string | null> {
  const list = listOf(await fetchJson(`${CBS.legacy}/DataProperties`));
  if (!list) return null;
  const m = list.find(isMeasureRow);
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

// Warm-instance memo on top of the DB cache: even a DB-cache hit costs a CBS
// key-resolution round-trip plus a table read, and the named rewind re-asks
// for the SAME regions on every reconstruction while the user waits. A yearly
// index series is stable far beyond a server instance's lifetime, so successes
// are held in module scope; failures are not memoized.
const regionIndexMemo = new Map<string, RegionIndex>();

export async function getRegionIndex(
  gemeente: string | null,
  province: string | null,
): Promise<RegionIndex | null> {
  const name = targetRegionName(gemeente, province);
  if (!name) return null;
  const memoized = regionIndexMemo.get(name);
  if (memoized) return memoized;
  const result = await getRegionIndexUncached(name);
  if (result) regionIndexMemo.set(name, result);
  return result;
}

async function getRegionIndexUncached(name: string): Promise<RegionIndex | null> {
  // Legacy OData (opendata.cbs.nl) is the working source for 85792NED. The v4
  // base (datasets.cbs.nl) currently 404s for this table, so it stays only as an
  // inert fallback below.
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

  // OData4 fallback (inert while datasets.cbs.nl 404s for this table; kept so the
  // path lights up automatically if/when the v4 publication appears).
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

  return null;
}

// ── Diagnostics (gated, read-only) ───────────────────────────────────────────
// Captures the intermediate resolution steps against the live OData so we can see
// which constant is off (region code, measure key, period format). Self-contained
// — does NOT touch the normal getRegionIndex path. Reports RAW (untrimmed)
// Title/Key/Identifier values so trailing-space / exact-title issues are visible.
// No credentials or secrets are involved or emitted.

export interface CbsSourceDebug {
  base: string;
  regioStatus: number | null;
  regioCount: number | null;
  regioMatches: Array<{ identifier: unknown; key: unknown; title: unknown }>;
  regioMatchFound: boolean;
  measureEndpoint: string;
  measureStatus: number | null;
  measureCount: number | null;
  measures: Array<{ identifier: unknown; key: unknown; title: unknown }>;
  measureMatched: string | null;
  obsStatus: number | null;
  obsCount: number | null;
  periodsSample: string[];
}

export interface CbsDebug {
  region: { gemeente: string | null; province: string | null; chosenRegionName: string | null };
  chosenRegionCode: string | null;
  buyYearPeriod: string | null;
  latestPeriod: string | null;
  v4: CbsSourceDebug;
  legacy: CbsSourceDebug;
  firstNullStep: string | null;
  reason: string | null;
}

function blankSource(base: string, measureEndpoint: string): CbsSourceDebug {
  return {
    base, regioStatus: null, regioCount: null, regioMatches: [], regioMatchFound: false,
    measureEndpoint, measureStatus: null, measureCount: null, measures: [], measureMatched: null,
    obsStatus: null, obsCount: null, periodsSample: [],
  };
}

async function debugFetch(url: string): Promise<{ status: number | null; data: unknown }> {
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(CBS.timeoutMs) });
    let data: unknown = null;
    try { data = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, data };
  } catch {
    return { status: null, data: null };
  }
}

// Yearly-period sampling: keep RAW period strings in the sample (so trailing
// spaces show), but match the JJ pattern on a trimmed copy.
function samplePeriods(perioden: unknown[]): { sample: string[]; latest: string | null; byYear: Map<number, string> } {
  const byYear = new Map<number, string>();
  let latest: string | null = null;
  const sample: string[] = [];
  for (const p of perioden) {
    const period = String(p ?? "");
    const m = CBS.yearlyPeriod.exec(period.trim());
    if (!m) continue;
    if (sample.length < 8) sample.push(period);
    byYear.set(Number(m[1]), period);
    if (latest == null || period > latest) latest = period;
  }
  return { sample, latest, byYear };
}

export async function diagnoseRegionIndex(
  gemeente: string | null,
  province: string | null,
  buyYear: number | null,
): Promise<CbsDebug> {
  const chosenRegionName = targetRegionName(gemeente, province);
  const dbg: CbsDebug = {
    region: { gemeente, province, chosenRegionName },
    chosenRegionCode: null,
    buyYearPeriod: null,
    latestPeriod: null,
    v4: blankSource(CBS.odata4, `${CBS.odata4}/MeasureCodes`),
    legacy: blankSource(CBS.legacy, `${CBS.legacy}/DataProperties`),
    firstNullStep: null,
    reason: null,
  };

  if (!chosenRegionName) {
    dbg.firstNullStep = "regionName";
    dbg.reason = "no gemeente/province resolved to a region name";
    return dbg;
  }
  const nameLc = chosenRegionName.toLowerCase();

  const applyPeriods = (rows: Record<string, unknown>[] | null, source: CbsSourceDebug) => {
    if (!rows) return;
    source.obsCount = rows.length;
    const { sample, latest, byYear } = samplePeriods(rows.map((r) => r.Perioden));
    source.periodsSample = sample;
    if (dbg.latestPeriod == null) dbg.latestPeriod = latest;
    if (dbg.buyYearPeriod == null && buyYear != null) dbg.buyYearPeriod = byYear.get(buyYear) ?? null;
  };

  // ── OData4 (datasets.cbs.nl) ──
  {
    const r = await debugFetch(`${CBS.odata4}/RegioS`);
    dbg.v4.regioStatus = r.status;
    const list = listOf(r.data);
    dbg.v4.regioCount = list?.length ?? null;
    if (list) {
      dbg.v4.regioMatches = list
        .filter((x) => String(x.Title ?? "").toLowerCase().includes(nameLc) || regionTitleMatches(x.Title, chosenRegionName))
        .map((x) => ({ identifier: x.Identifier ?? null, key: x.Key ?? null, title: x.Title }));
      const exact = list.find((x) => regionTitleMatches(x.Title, chosenRegionName));
      dbg.v4.regioMatchFound = !!exact;
      if (exact && typeof exact.Identifier === "string") dbg.chosenRegionCode = exact.Identifier;
    }
    const m = await debugFetch(`${CBS.odata4}/MeasureCodes`);
    dbg.v4.measureStatus = m.status;
    const mList = listOf(m.data);
    dbg.v4.measureCount = mList?.length ?? null;
    if (mList) {
      dbg.v4.measures = mList.map((x) => ({ identifier: x.Identifier ?? null, key: x.Key ?? null, title: x.Title }));
      const mm = mList.find(isMeasureRow);
      dbg.v4.measureMatched = mm && typeof mm.Identifier === "string" ? mm.Identifier : null;
    }
    if (dbg.chosenRegionCode && dbg.v4.measureMatched) {
      const filter = `RegioS eq '${dbg.chosenRegionCode}' and Measure eq '${dbg.v4.measureMatched}'`;
      const obs = await debugFetch(`${CBS.odata4}/Observations?$select=Perioden,Value&$filter=${encodeURIComponent(filter)}`);
      dbg.v4.obsStatus = obs.status;
      applyPeriods(listOf(obs.data), dbg.v4);
    }
  }

  // ── Legacy (opendata.cbs.nl) ──
  {
    const r = await debugFetch(`${CBS.legacy}/RegioS`);
    dbg.legacy.regioStatus = r.status;
    const list = listOf(r.data);
    dbg.legacy.regioCount = list?.length ?? null;
    let legacyKey: string | null = null;
    if (list) {
      dbg.legacy.regioMatches = list
        .filter((x) => String(x.Title ?? "").toLowerCase().includes(nameLc) || regionTitleMatches(x.Title, chosenRegionName))
        .map((x) => ({ identifier: x.Identifier ?? null, key: x.Key ?? null, title: x.Title }));
      const exact = list.find((x) => regionTitleMatches(x.Title, chosenRegionName));
      dbg.legacy.regioMatchFound = !!exact;
      if (exact && typeof exact.Key === "string") legacyKey = exact.Key;
      if (dbg.chosenRegionCode == null && legacyKey) dbg.chosenRegionCode = legacyKey;
    }
    const m = await debugFetch(`${CBS.legacy}/DataProperties`);
    dbg.legacy.measureStatus = m.status;
    const mList = listOf(m.data);
    dbg.legacy.measureCount = mList?.length ?? null;
    let legacyMeasure: string | null = null;
    if (mList) {
      dbg.legacy.measures = mList.map((x) => ({ identifier: x.Identifier ?? null, key: x.Key ?? null, title: x.Title }));
      const mm = mList.find(isMeasureRow);
      legacyMeasure = mm && typeof mm.Key === "string" ? mm.Key : null;
      dbg.legacy.measureMatched = legacyMeasure;
    }
    if (legacyKey && legacyMeasure) {
      const filter = `(RegioS eq '${legacyKey}')`;
      const obs = await debugFetch(`${CBS.legacy}/TypedDataSet?$select=${encodeURIComponent(`Perioden,${legacyMeasure}`)}&$filter=${encodeURIComponent(filter)}`);
      dbg.legacy.obsStatus = obs.status;
      applyPeriods(listOf(obs.data), dbg.legacy);
    }
  }

  // ── First failing step ──
  if (dbg.v4.regioStatus == null && dbg.legacy.regioStatus == null) {
    dbg.firstNullStep = "regios_fetch";
    dbg.reason = "RegioS list fetch failed on both OData bases (network or endpoint)";
  } else if (!dbg.v4.regioMatchFound && !dbg.legacy.regioMatchFound) {
    dbg.firstNullStep = "regios_match";
    dbg.reason = `no RegioS Title matched "${chosenRegionName}" (check exact title / trailing space)`;
  } else if (!dbg.v4.measureMatched && !dbg.legacy.measureMatched) {
    dbg.firstNullStep = "measure_match";
    dbg.reason = "no measure Title matched the index regex (check the measure title)";
  } else if (dbg.latestPeriod == null) {
    dbg.firstNullStep = "observations";
    dbg.reason = "no yearly (JJ) periods parsed from observations (check period format / filter)";
  }

  return dbg;
}
