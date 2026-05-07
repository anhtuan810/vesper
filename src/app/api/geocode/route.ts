import { NextRequest, NextResponse } from "next/server";

// In-memory cache keyed by normalized address string
const cache = new Map<string, { latitude: number; longitude: number }>();

let lastRequestTime = 0;
const MIN_INTERVAL_MS = 1100; // Nominatim policy: max 1 req/sec

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached) return NextResponse.json(cached);

  // Rate-limit outbound requests per Nominatim policy
  const now = Date.now();
  const wait = MIN_INTERVAL_MS - (now - lastRequestTime);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRequestTime = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Vesper/1.0 (https://app.novahub.nl)",
      "Accept-Language": "en",
    },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "geocoding failed" }, { status: 502 });
  }

  const data = await res.json() as Array<{ lat: string; lon: string }>;
  if (!data.length) {
    return NextResponse.json({ error: "address not found" }, { status: 404 });
  }

  const result = {
    latitude: parseFloat(data[0].lat),
    longitude: parseFloat(data[0].lon),
  };

  cache.set(key, result);
  return NextResponse.json(result);
}
