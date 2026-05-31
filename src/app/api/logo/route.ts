import { NextRequest, NextResponse } from "next/server";

const SYMBOL_RE = /^[A-Za-z0-9.\-]+$/;
const MAX_SYMBOL_LEN = 16;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CACHE_MAX = 500;
const FETCH_TIMEOUT_MS = 5000;

const EXCHANGE_SUFFIXES = new Set([
  "AS", "L", "PA", "DE", "F", "SW", "MI", "MC", "BR", "LS", "HE", "ST", "OL",
  "CO", "VI", "WA", "HK", "T", "AX", "NZ", "SI", "KS", "KQ", "TO", "V", "SA",
  "MX", "BA",
]);

function fmpTicker(symbol: string): string {
  const dot = symbol.lastIndexOf(".");
  if (dot === -1) return symbol;
  const suffix = symbol.slice(dot + 1).toUpperCase();
  return EXCHANGE_SUFFIXES.has(suffix) ? symbol.slice(0, dot) : symbol;
}

interface CacheEntry {
  bytes: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();

// 1x1 transparent PNG, returned (HTTP 200) when no upstream logo exists so the
// client falls back to a monogram without the browser logging a failed load.
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

function transparentPixel() {
  return new NextResponse(TRANSPARENT_PNG, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}

function upstreamUrl(type: string, symbol: string): string {
  if (type === "crypto") {
    // cryptocurrency-icons names its files in lowercase (e.g. btc.svg).
    return `https://cdn.jsdelivr.net/npm/cryptocurrency-icons/svg/color/${symbol.toLowerCase()}.svg`;
  }
  // FMP's logo endpoint is case-sensitive and only serves uppercase tickers
  // (e.g. AAPL.png); a lowercased ticker 404s. Keep the symbol's original case.
  return `https://images.financialmodelingprep.com/symbol/${fmpTicker(symbol)}.png`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const type = searchParams.get("type");
  const symbol = searchParams.get("symbol");

  if (type !== "crypto" && type !== "stock") {
    return new NextResponse("invalid type", { status: 400 });
  }

  if (!symbol || !SYMBOL_RE.test(symbol) || symbol.length > MAX_SYMBOL_LEN) {
    return new NextResponse("invalid symbol", { status: 400 });
  }

  const cacheKey = `${type}:${symbol.toLowerCase()}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);

  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    return new NextResponse(cached.bytes, {
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(upstreamUrl(type, symbol), {
      signal: controller.signal,
    });

    if (!upstream.ok) {
      return transparentPixel();
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const bytes = await upstream.arrayBuffer();

    if (cache.size >= CACHE_MAX) {
      cache.delete(cache.keys().next().value!);
    }
    cache.set(cacheKey, { bytes, contentType, fetchedAt: now });

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=604800, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch {
    return transparentPixel();
  } finally {
    clearTimeout(timeoutId);
  }
}
