import { NextRequest, NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";
import { getAuthUser } from "@/lib/supabase";
import { fetchYahooPrice } from "@/lib/prices-server";

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

  const validSymbols = symbols.filter((s): s is string => typeof s === "string" && s.length > 0);
  if (validSymbols.length === 0) {
    return NextResponse.json({ error: "No valid symbols" }, { status: 400 });
  }

  const results = await Promise.allSettled(validSymbols.map((s) => fetchYahooPrice(s)));
  const prices = results.map((r) => r.status === "fulfilled" ? r.value : null).filter(Boolean);
  return NextResponse.json({ prices });
}
