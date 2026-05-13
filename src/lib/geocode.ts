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
};

const cache = new Map<string, GeocodeResult>();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

const NOMINATIM_HEADERS = {
  "User-Agent": "Vesper/1.0 (https://app.novahub.nl)",
  "Accept-Language": "en",
};

async function nominatimFetch(url: string): Promise<NominatimResult[] | null> {
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  try {
    const res = await fetch(url, { headers: NOMINATIM_HEADERS });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : null;
  } catch {
    return null;
  }
}

// Build a compact "Road Number, Postcode, Country" string from Nominatim address fields.
// Falls back to display_name when essential components are missing.
function buildCanonicalAddress(result: NominatimResult): string {
  const addr = result.address;
  if (!addr) return result.display_name;

  const parts: string[] = [];

  if (addr.road && addr.house_number) {
    parts.push(`${addr.road} ${addr.house_number}`);
  } else if (addr.road) {
    parts.push(addr.road);
  }

  if (addr.postcode) {
    parts.push(addr.postcode);
  } else {
    const city = addr.city || addr.town || addr.village;
    if (city) parts.push(city);
  }

  if (addr.country) parts.push(addr.country);

  return parts.length >= 2 ? parts.join(", ") : result.display_name;
}

// Parse "Street Name 100, City, CC" into components for a structured Nominatim query.
// Returns empty object when the address has fewer than 2 comma-separated parts.
function parseAddressParts(address: string): {
  street?: string;
  city?: string;
  countryInAddress?: string;
} {
  const parts = address.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 3) {
    return { street: parts[0], city: parts[1], countryInAddress: parts[parts.length - 1] };
  }
  if (parts.length === 2) {
    return { city: parts[0], countryInAddress: parts[1] };
  }
  return {};
}

export async function geocodeAddress(
  address: string,
  country?: string | null
): Promise<GeocodeResult | null> {
  const cacheKey = `${address.toLowerCase().trim()}|${(country || "").toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { street, city, countryInAddress } = parseAddressParts(address);
  const countryCode = country || countryInAddress;

  // Attempt 1: structured query — street-level precision, preferred over free-text
  if (city && countryCode) {
    const params = new URLSearchParams({ format: "json", limit: "1", addressdetails: "1" });
    params.set("city", city.trim());
    params.set("country", countryCode.trim());
    if (street) params.set("street", street.trim());
    const structuredUrl = `https://nominatim.openstreetmap.org/search?${params}`;

    const data = await nominatimFetch(structuredUrl);
    if (data) {
      const result: GeocodeResult = {
        canonicalAddress: buildCanonicalAddress(data[0]),
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        hasHouseNumber: !!data[0].address?.house_number,
      };
      cache.set(cacheKey, result);
      return result;
    }
  }

  // Attempt 2: free-text fallback (appends country when not already present in the string)
  const q =
    countryCode && !address.toLowerCase().includes(countryCode.toLowerCase())
      ? `${address}, ${countryCode}`
      : address;
  const freeTextUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;

  const data = await nominatimFetch(freeTextUrl);
  if (!data) return null;

  const result: GeocodeResult = {
    canonicalAddress: buildCanonicalAddress(data[0]),
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
    hasHouseNumber: !!data[0].address?.house_number,
  };
  cache.set(cacheKey, result);
  return result;
}
