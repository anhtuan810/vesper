import { NextRequest, NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";
import { getAuthUser } from "@/lib/supabase";
import { fetchYahooPrice, fetchPriceWithFallback } from "@/lib/prices-server";

validateEnv();

export type { PriceResult } from "@/lib/prices-server";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

  const result = await fetchYahooPrice(symbol);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "not found" ? 404 : 500 });
  }
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" },
  });
}

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbols } = await req.json();
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
  }

  type Entry = { symbol: string; country?: string | null };
  const entries: Entry[] = (symbols as unknown[]).flatMap((item) => {
    if (typeof item === "string") return item.length > 0 ? [{ symbol: item }] : [];
    if (item && typeof item === "object" && typeof (item as Entry).symbol === "string" && (item as Entry).symbol.length > 0) {
      return [{ symbol: (item as Entry).symbol, country: (item as Entry).country }];
    }
    return [];
  });

  if (entries.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  const results = await Promise.allSettled(
    entries.map(({ symbol, country }) => fetchPriceWithFallback(symbol, country ?? undefined))
  );
  const prices = results.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
  return NextResponse.json({ prices });
}
