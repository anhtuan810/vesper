import { NextRequest, NextResponse } from "next/server";
import { validateEnv } from "@/lib/env";
import { fetchYahooPrice } from "@/lib/prices-server";

validateEnv();

export type { PriceResult } from "@/lib/prices-server";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol");
  if (!symbol) return NextResponse.json({ error: "Symbol required" }, { status: 400 });

  const result = await fetchYahooPrice(symbol);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.error === "not found" ? 404 : 500 });
  }
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const { symbols } = await req.json();
  if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "Symbols array required" }, { status: 400 });
  }

  const results = await Promise.all(symbols.map((s: string) => fetchYahooPrice(s)));
  return NextResponse.json({ prices: results });
}
