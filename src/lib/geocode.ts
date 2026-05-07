// Shared geocoding logic used by /api/geocode and /api/chat.
// Single in-memory cache + Nominatim rate-limiter (1 req/sec).

const cache = new Map<string, { latitude: number; longitude: number }>();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

const NOMINATIM_HEADERS = {
  "User-Agent": "Vesper/1.0 (https://app.novahub.nl)",
  "Accept-Language": "en",
};

async function nominatimFetch(url: string): Promise<Array<{ lat: string; lon: string }> | null> {
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
): Promise<{ latitude: number; longitude: number } | null> {
  const cacheKey = `${address.toLowerCase().trim()}|${(country || "").toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const { street, city, countryInAddress } = parseAddressParts(address);
  const countryCode = country || countryInAddress;

  // Attempt 1: structured query — street-level precision, preferred over free-text
  if (city && countryCode) {
    const params = new URLSearchParams({ format: "json", limit: "1" });
    params.set("city", city.trim());
    params.set("country", countryCode.trim());
    if (street) params.set("street", street.trim());
    const structuredUrl = `https://nominatim.openstreetmap.org/search?${params}`;

    const data = await nominatimFetch(structuredUrl);
    if (data) {
      const result = { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
      cache.set(cacheKey, result);
      return result;
    }
  }

  // Attempt 2: free-text fallback (appends country when not already present in the string)
  const q =
    countryCode && !address.toLowerCase().includes(countryCode.toLowerCase())
      ? `${address}, ${countryCode}`
      : address;
  const freeTextUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;

  const data = await nominatimFetch(freeTextUrl);
  if (!data) return null;

  const result = { latitude: parseFloat(data[0].lat), longitude: parseFloat(data[0].lon) };
  cache.set(cacheKey, result);
  return result;
}
