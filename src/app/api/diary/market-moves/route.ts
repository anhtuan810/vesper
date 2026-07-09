import { NextRequest, NextResponse, after } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { getDiaryMarketMoves, getStoredMarketSwings, storeMarketSwings } from "@/lib/diary-market-moves";
import { attachStories, backfillMarketStories } from "@/lib/market-story-cache";

const CACHE = { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" };

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  try {
    // Fast path: serve the precomputed swings (generated in the background).
    // The "why the market moved" story is global reference data, so it is joined
    // in from the shared cache at read time (cheap, best-effort) and any missing
    // stories are generated in the background — never blocking this response.
    const stored = await getStoredMarketSwings(user.id, supabase);
    if (stored.length > 0) {
      const withStories = await attachStories(stored, supabase);
      after(() => backfillMarketStories(withStories));
      return NextResponse.json({ moves: withStories }, { headers: CACHE });
    }
    // Cold (new user, cache not warmed yet, or migration just applied): compute
    // now so the user still sees them, and persist in the background for next time.
    const moves = await getDiaryMarketMoves(user.id, supabase);
    const withStories = await attachStories(moves, supabase);
    after(() => {
      storeMarketSwings(user.id, moves);
      backfillMarketStories(withStories);
    });
    return NextResponse.json({ moves: withStories }, { headers: CACHE });
  } catch (err) {
    console.warn("[diary/market-moves] failed:", err);
    return NextResponse.json({ moves: [] });
  }
}
