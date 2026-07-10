import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { getDiaryMarketMoves, getStoredMarketSwings, storeMarketSwings } from "@/lib/diary-market-moves";

const CACHE = { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" };

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  try {
    // Fast path: serve the precomputed swings (generated in the background).
    const stored = await getStoredMarketSwings(user.id, supabase);
    if (stored.length > 0) {
      return NextResponse.json({ moves: stored }, { headers: CACHE });
    }
    // Cold (new user, cache not warmed yet, or migration just applied): compute
    // now so the user still sees them, and persist in the background for next time.
    const moves = await getDiaryMarketMoves(user.id, supabase);
    after(() => storeMarketSwings(user.id, moves));
    return NextResponse.json({ moves }, { headers: CACHE });
  } catch (err) {
    console.warn("[diary/market-moves] failed:", err);
    return NextResponse.json({ moves: [] });
  }
}
