import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getDiaryMarketMoves } from "@/lib/diary-market-moves";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();

  try {
    const moves = await getDiaryMarketMoves(user.id, supabase);
    return NextResponse.json({ moves });
  } catch (err) {
    console.warn("[diary/market-moves] failed:", err);
    return NextResponse.json({ moves: [] });
  }
}
