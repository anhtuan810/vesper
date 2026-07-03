import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { fetchHistory } from "@/lib/prices-server";
import type { PricePoint } from "@/lib/prices-server";
import { mapWithConcurrency } from "@/lib/concurrency";
import { PRICES_MAX_SYMBOLS, PRICES_FETCH_CONCURRENCY } from "@/lib/constants";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbols, range = "1W" } = await req.json();

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "symbols array required" }, { status: 400 });
  }

  // Cap the batch and bound concurrency so a single request can't trigger an
  // unbounded burst of upstream history fetches.
  const unique = [...new Set(symbols as string[])].slice(0, PRICES_MAX_SYMBOLS);
  const results = await mapWithConcurrency(unique, PRICES_FETCH_CONCURRENCY, (s) => fetchHistory(s, range));

  const data: Record<string, PricePoint[]> = {};
  unique.forEach((s, i) => { data[s] = results[i]; });

  return NextResponse.json({ data });
}
