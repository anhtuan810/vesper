// Shared geocoding logic used by /api/geocode and /api/chat.
// Single in-memory cache + Nominatim rate-limiter (1 req/sec).

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
};

export type GeocodeResult = {
  canonicalAddress: string;
  latitude: number;
  longitude: number;
  hasHouseNumber: boolean;
  // Resolved postcode / house number as returned by the geocoder, so callers can
  // compare them to what the user actually typed and flag a changed match.
  postcode: string | null;
  houseNumber: string | null;
};

const cache = new Map<string, GeocodeResult>();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

const NOMINATIM_HEADERS = {
  "User-Agent": "Volnar/1.0 (https://app.novahub.nl)",
  "Accept-Language": "en",
};

// Serialize slot reservations through a single promise chain. The previous
// implementation read `lastRequestTime` and slept, but only advanced it AFTER
// the await — so N concurrent callers all read the same timestamp, computed the
// same (often zero) wait, and fired Nominatim in a burst, violating its 1 req/s
// policy and risking an IP ban. Chaining makes each caller wait for the prior
// reservation before claiming and stamping its own 1.1s-spaced slot.
let throttleChain: Promise<void> = Promise.resolve();

function reserveNominatimSlot(): Promise<void> {
  const run = throttleChain.then(async () => {
    const wait = MIN_INTERVAL_MS - (Date.now() - lastRequestTime);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestTime = Date.now();
  });
  // Keep the chain alive even if a reservation somehow rejects.
  throttleChain = run.catch(() => {});
  return run;
}

async function nominatimFetch(url: string): Promise<NominatimResult[] | null> {
  await reserveNominatimSlot();

  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

// Build a "Road Number, Postcode City, Country" string from Nominatim address
// fields. Falls back to display_name when essential components are missing.
//
// CRITICAL — this string must round-trip: a property added through chat is
// geocoded at propose time, this canonical form is shown as the "Resolved
// address" and stored, and then it is geocoded AGAIN at commit ("Confirm and
// save") straight from this string. The old format dropped the city and kept
// only the postcode ("5th Avenue 350, 10118, United States"), so the second
// pass read "10118" as the city, found no such town, and the commit failed with
// "I couldn't find that address" — even though the first pass had resolved it.
// Keeping the city in the locality segment makes parseAddressParts recover a
// clean city + postcode on the way back in. Exported for tests.
export function buildCanonicalAddress(result: NominatimResult): string {
  const addr = result.address;
  if (!addr) return result.display_name;

  const parts: string[] = [];

  if (addr.road && addr.house_number) {
    parts.push(`${addr.road} ${addr.house_number}`);
  } else if (addr.road) {
    parts.push(addr.road);
  }

  // Locality line: postcode AND city together ("10118 New York"), so the string
  // re-parses into both fields. Never postcode-only — that is what broke the
  // commit round-trip. Falls back to whichever component is present.
  const city = addr.city || addr.town || addr.village || addr.municipality || addr.county;
  const locality = [addr.postcode, city].filter(Boolean).join(" ");
  if (locality) parts.push(locality);

  if (addr.country) parts.push(addr.country);

  return parts.length >= 2 ? parts.join(", ") : result.display_name;
}

// Normalise a user-/model-typed address before geocoding. The model sometimes
// re-appends the postcode when it re-states an address (e.g. the chat showed
// "Hafenstraße 16, 18356 Barth, 18356, Germany"), and that duplicate makes the
// geocoder fail. Drop a standalone postcode segment that already appears inside
// another segment, and collapse exact duplicate segments. Exported for tests.
export function cleanAddress(address: string): string {
  const segments = address.split(",").map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const seg of segments) {
    // A standalone postcode (5-digit DE / "1234 AB" NL / 4-5 digit) that already
    // appears within a segment we've kept is a duplicate — skip it.
    if (/^\d{4,5}(?:\s?[A-Za-z]{2})?$/.test(seg)) {
      const token = seg.replace(/\s+/g, "").toUpperCase();
      if (out.some((p) => p.replace(/\s+/g, "").toUpperCase().includes(token))) continue;
    }
    // Skip an exact (case-insensitive) duplicate of a segment already kept.
    if (out.some((p) => p.toLowerCase() === seg.toLowerCase())) continue;
    out.push(seg);
  }
  return out.join(", ");
}

// Parse "Street Name 100, City, CC" into components for a structured Nominatim
// query. Handles the European "Street N, <postcode> City, Country" form by
// splitting the postcode out of the city segment (German "18356 Barth", Dutch
// "5625 NJ Eindhoven") so the structured query gets a clean city + postalcode.
// Returns empty object when the address has fewer than 2 comma-separated parts.
// Exported for tests.
export function parseAddressParts(address: string): {
  street?: string;
  city?: string;
  postcode?: string;
  countryInAddress?: string;
} {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return {};

  const countryInAddress = parts[parts.length - 1];
  const street = parts.length >= 3 ? parts[0] : undefined;
  const cityField = parts.length >= 3 ? parts[1] : parts[0];

  // A city segment that is JUST a postcode ("10118") is a postcode, not a city —
  // feed it to the structured query as the postcode and leave the city empty so
  // we never search for a town literally named "10118" (the commit-round-trip
  // failure on a postcode-only canonical address).
  if (/^\d{4,5}(?:\s?[A-Za-z]{2})?$/.test(cityField)) {
    return { street, city: undefined, postcode: cityField, countryInAddress };
  }

  // Pull a leading ("18356 Barth", "5625 NJ Eindhoven", "10118 New York") or
  // trailing ("Barth 18356") postcode out of the city segment.
  let postcode: string | undefined;
  let city: string | undefined = cityField;
  const leading = cityField.match(/^(\d{4,5}(?:\s?[A-Za-z]{2})?)\s+(.+)$/);
  const trailing = cityField.match(/^(.+?)\s+(\d{4,5}(?:\s?[A-Za-z]{2})?)$/);
  if (leading) {
    postcode = leading[1].trim();
    city = leading[2].trim();
  } else if (trailing) {
    city = trailing[1].trim();
    postcode = trailing[2].trim();
  }

  return { street, city, postcode, countryInAddress };
}

export async function geocodeAddress(
  address: string,
  country?: string | null
): Promise<GeocodeResult | null> {
  // Normalise first: drop a duplicated postcode the model sometimes re-appends
  // (e.g. "Hafenstraße 16, 18356 Barth, 18356, Germany") before caching/parsing.
  const cleaned = cleanAddress(address);

  const cacheKey = `${cleaned.toLowerCase().trim()}|${(country || "").toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { street, city, postcode, countryInAddress } = parseAddressParts(cleaned);
  const countryCode = country || countryInAddress;

  // Attempt 1: structured query — street-level precision, preferred over free-text.
  // A postcode alone (with country) is enough to run it — we don't require a city,
  // so a lossy "postcode, country" address still gets the precise structured pass.
  if ((city || postcode) && countryCode) {
    const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1" });
    if (city) params.set("city", city.trim());
    params.set("country", countryCode.trim());
    if (street) params.set("street", street.trim());
    if (postcode) params.set("postalcode", postcode.trim());
    const structuredUrl = `https://nominatim.openstreetmap.org/search?${params}`;

    const data = await nominatimFetch(structuredUrl);
    if (data) {
      const result: GeocodeResult = {
        canonicalAddress: buildCanonicalAddress(data[0]),
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        hasHouseNumber: !!data[0].address?.house_number,
        postcode: data[0].address?.postcode ?? null,
        houseNumber: data[0].address?.house_number ?? null,
      };
      cache.set(cacheKey, result);
      return result;
    }
  }

  // Attempt 2: free-text fallback (appends country when not already present in the string)
  const q =
    countryCode && !cleaned.toLowerCase().includes(countryCode.toLowerCase())
      ? `${cleaned}, ${countryCode}`
      : cleaned;
  const freeTextUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;

  const data = await nominatimFetch(freeTextUrl);
  if (!data) return null;

  const result: GeocodeResult = {
    canonicalAddress: buildCanonicalAddress(data[0]),
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    hasHouseNumber: !!data[0].address?.house_number,
    postcode: data[0].address?.postcode ?? null,
    houseNumber: data[0].address?.house_number ?? null,
  };
  cache.set(cacheKey, result);
  return result;
}

// ── Entered-vs-resolved comparison ───────────────────────────────────────────
// The geocoder returns its best guess even for a wrong or ambiguous input (e.g.
// "5629NJ" silently resolved to "5625NJ"). Compare the resolved postcode and
// house number to what the user typed so a changed match can be flagged instead
// of presented as clean. Pure / no I/O. Conservative: only reports `changed`
// when BOTH sides expose a comparable token and they differ — a field we cannot
// parse from the user's text is never treated as a mismatch (no false flags).

export interface AddressMatch {
  changed: boolean;
  enteredPostcode: string | null;
  resolvedPostcode: string | null;
  enteredHouseNumber: string | null;
  resolvedHouseNumber: string | null;
}

// Strip whitespace and upper-case — postcodes compare regardless of spacing/case.
const squash = (s: string): string => s.replace(/\s+/g, "").toUpperCase();

// First postcode-looking token in the text (NL "1234 AB" form).
function extractEnteredPostcode(entered: string): string | null {
  const m = entered.match(/\b\d{4}\s?[A-Za-z]{2}\b/);
  return m ? squash(m[0]) : null;
}

// House number = the trailing number on the street segment (before the first
// comma), so postcode digits elsewhere in the string don't get mistaken for it.
function extractEnteredHouseNumber(entered: string): string | null {
  const firstSegment = entered.split(",")[0] ?? "";
  const m = firstSegment.match(/(\d+\s?[a-zA-Z]?)\s*$/);
  return m ? squash(m[1]) : null;
}

export function compareEnteredAddress(entered: string, resolved: GeocodeResult): AddressMatch {
  const enteredPostcode = extractEnteredPostcode(entered);
  const resolvedPostcode = resolved.postcode ? squash(resolved.postcode) : null;
  const enteredHouseNumber = extractEnteredHouseNumber(entered);
  const resolvedHouseNumber = resolved.houseNumber ? squash(resolved.houseNumber) : null;

  const postcodeChanged =
    enteredPostcode != null && resolvedPostcode != null && enteredPostcode !== resolvedPostcode;
  const houseChanged =
    enteredHouseNumber != null && resolvedHouseNumber != null && enteredHouseNumber !== resolvedHouseNumber;

  return {
    changed: postcodeChanged || houseChanged,
    enteredPostcode,
    resolvedPostcode,
    enteredHouseNumber,
    resolvedHouseNumber,
  };
}
