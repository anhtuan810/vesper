import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { fetchHistory } from "@/lib/prices-server";
import type { PricePoint } from "@/lib/prices-server";

export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { symbols, range = "1W" } = await req.json();

  if (!Array.isArray(symbols) || symbols.length === 0) {
    return NextResponse.json({ error: "symbols array required" }, { status: 400 });
  }

  const unique = [...new Set(symbols as string[])];
  const results = await Promise.all(unique.map((s) => fetchHistory(s, range)));

  const data: Record<string, PricePoint[]> = {};
  unique.forEach((s, i) => { data[s] = results[i]; });

  return NextResponse.json({ data });
}
