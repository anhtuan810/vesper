// Deterministic WOZ (official Dutch municipal property valuation) history.
// NO LLM involvement: resolve → cache → fetch → parse → CAGR are all code.
// Server-side ONLY — the loket is never called from the client. The property
// address is disclosed only to PDOK and the official loket, nowhere else.
//
// Every step fails GRACEFULLY: a non-NL property, an unresolved address, a loket
// error, or an unparseable payload all return { available: false } — never throws.

import { createServerSupabase } from "@/lib/supabase";

// ── External endpoints ───────────────────────────────────────────────────────
// PDOK Locatieserver — free, no API key. Resolves an address to a BAG id.
const PDOK_FREE_URL = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";

// WOZ-waardeloket backend. ⚠ UNDOCUMENTED endpoint: the loket front-end calls
// this to retrieve the value history for a BAG "nummeraanduiding" id. This URL is
// the single point most likely to need adjustment against the live service.
const WOZ_LOKET_ENDPOINT = (nummeraanduidingId: string): string =>
  `https://www.wozwaardeloket.nl/wozwaardeloket-api/v1/wozwaarden/nummeraanduiding/${encodeURIComponent(nummeraanduidingId)}`;

const FETCH_TIMEOUT_MS = 8000;
const CACHE_TTL_DAYS = 90;

export interface WozEntry {
  /** Reference-date year (peildatum). A year's WOZ reflects 1 January of the prior year. */
  year: number;
  value: number;
}

export interface WozResult {
  available: boolean;
  bagId?: string;
  history?: WozEntry[];
  fetchedAt?: string;
}

const UNAVAILABLE: WozResult = { available: false };

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

async function timedFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch {
    return null;
  }
}

// Resolve a NL address to a BAG nummeraanduiding id via PDOK. Null on any failure.
async function resolveBagId(address: string): Promise<string | null> {
  const url = `${PDOK_FREE_URL}?q=${encodeURIComponent(address)}&fq=type:adres&rows=1`;
  const res = await timedFetch(url, { headers: { Accept: "application/json" } });
  if (!res || !res.ok) return null;
  try {
    const data = await res.json();
    const doc = data?.response?.docs?.[0];
    if (!doc) return null;
    const id = doc.nummeraanduiding_id ?? doc.adresseerbaarobject_id ?? doc.id ?? null;
    return typeof id === "string" && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

// Parse the loket payload into yearly {year, value}. Defensive against shape
// changes — tries the known field names and returns null when nothing parses.
export function parseWozWaarden(data: unknown): WozEntry[] | null {
  const obj = data as Record<string, unknown> | null;
  const arr =
    (obj?.wozWaarden as unknown[]) ??
    ((obj?.wozWaarde as Record<string, unknown> | undefined)?.wozWaarden as unknown[]) ??
    null;
  if (!Array.isArray(arr) || arr.length === 0) return null;

  const byYear = new Map<number, number>();
  for (const raw of arr) {
    const w = raw as Record<string, unknown>;
    const peil = (w.peildatum ?? w.peilDatum ?? w.datum) as string | undefined;
    const valRaw = (w.vastgesteldeWaarde ?? w.wozWaarde ?? w.waarde) as number | string | undefined;
    if (!peil) continue;
    const year = Number(String(peil).slice(0, 4));
    const value = typeof valRaw === "number" ? valRaw : Number(valRaw);
    if (Number.isFinite(year) && year > 1990 && Number.isFinite(value) && value > 0) {
      byYear.set(year, value); // latest wins per year
    }
  }
  if (byYear.size === 0) return null;
  return [...byYear.entries()]
    .map(([year, value]) => ({ year, value }))
    .sort((a, b) => a.year - b.year);
}

// Single isolated WOZ-source HTTP call. Returns parsed history or null.
async function fetchWozFromLoket(nummeraanduidingId: string): Promise<WozEntry[] | null> {
  const res = await timedFetch(WOZ_LOKET_ENDPOINT(nummeraanduidingId), {
    headers: {
      Accept: "application/json",
      "User-Agent": "Volnar/1.0 (https://app.novahub.nl)",
    },
  });
  if (!res || !res.ok) return null;
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return null;
  }
  return parseWozWaarden(data);
}

/**
 * Deterministic WOZ history for a property. NL-only; resolves via PDOK, serves
 * from woz_cache when fetched within ~90 days, else fetches the loket and caches.
 * Returns { available: false } on any failure — never throws.
 *
 * Assumed woz_cache schema: (bag_id text primary key, history jsonb, fetched_at timestamptz).
 */
export async function getWozHistory(opts: {
  address: string | null;
  country: string | null;
}): Promise<WozResult> {
  if (!isNL(opts.country)) return UNAVAILABLE;
  const address = (opts.address || "").trim();
  if (!address) return UNAVAILABLE;

  const bagId = await resolveBagId(address);
  if (!bagId) return UNAVAILABLE;

  const supabase = createServerSupabase();

  // Cache hit within TTL?
  try {
    const { data: cached } = await supabase
      .from("woz_cache")
      .select("history, fetched_at")
      .eq("bag_id", bagId)
      .maybeSingle();
    if (cached?.fetched_at) {
      const ageDays = (Date.now() - new Date(cached.fetched_at as string).getTime()) / 86_400_000;
      const history = cached.history as WozEntry[] | null;
      if (ageDays <= CACHE_TTL_DAYS && Array.isArray(history) && history.length > 0) {
        return { available: true, bagId, history, fetchedAt: cached.fetched_at as string };
      }
    }
  } catch {
    /* cache read is best-effort — fall through to a live fetch */
  }

  const history = await fetchWozFromLoket(bagId);
  if (!history || history.length === 0) return UNAVAILABLE;

  const fetchedAt = new Date().toISOString();
  try {
    await supabase
      .from("woz_cache")
      .upsert({ bag_id: bagId, history, fetched_at: fetchedAt }, { onConflict: "bag_id" });
  } catch {
    /* cache write is best-effort */
  }

  return { available: true, bagId, history, fetchedAt };
}
