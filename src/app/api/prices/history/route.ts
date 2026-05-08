import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase";
import { fetchHistory } from "@/lib/prices-server";

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = req.nextUrl.searchParams.get("symbol");
  const range = req.nextUrl.searchParams.get("range") ?? "1W";

  if (!symbol) {
    return NextResponse.json({ error: "symbol required" }, { status: 400 });
  }

  const data = await fetchHistory(symbol, range);
  return NextResponse.json({ data });
}
