// Shared geocoding logic used by /api/geocode and /api/chat.
// Single in-memory cache + Nominatim rate-limiter (1 req/sec).

const cache = new Map<string, { latitude: number; longitude: number }>();
let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

export async function geocodeAddress(
  address: string
): Promise<{ latitude: number; longitude: number } | null> {
  const key = address.toLowerCase().trim();
  const cached = cache.get(key);
  if (cached) return cached;

  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Vesper/1.0 (https://app.novahub.nl)",
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data.length) return null;

    const result = {
      latitude: parseFloat(data[0].lat),
      longitude: parseFloat(data[0].lon),
    };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
