import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { backfillSnapshots } from "@/lib/snapshot";

// Diagnostic for a stuck net-worth chart (the "single dot" symptom). Reports why
// the history rebuild is or isn't producing snapshot rows for the CALLING user,
// and re-runs it so a first-time/transient miss self-heals. Auth-scoped: it only
// ever reads and rebuilds the caller's own data. Open it in a logged-in browser
// on the web app: GET /api/debug/snapshot-status
const TRADEABLE = new Set(["stocks", "etf", "crypto", "gold"]);

export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const today = new Date().toISOString().slice(0, 10);

  const [snapsRes, assetsRes, mutsRes, demoRes] = await Promise.all([
    supabase.from("snapshots").select("date, total_value").eq("user_id", user.id).order("date", { ascending: true }),
    supabase.from("assets").select("id, type, symbol, buy_date, removed_at").eq("user_id", user.id),
    supabase.from("mutations").select("occurred_at").eq("user_id", user.id).not("asset_id", "is", null),
    supabase.from("entitlements").select("user_id").eq("user_id", user.id).eq("product_id", "demo").limit(1).maybeSingle(),
  ]);

  const snaps = snapsRes.data ?? [];
  const assets = assetsRes.data ?? [];
  const muts = mutsRes.data ?? [];
  const historicalBefore = snaps.filter((s) => s.date < today).length;
  const earliestMutation = muts.map((m) => m.occurred_at as string | null).filter(Boolean).sort()[0] ?? null;
  const heldTradeables = assets.filter((a) => TRADEABLE.has(a.type as string) && a.symbol && a.removed_at == null).length;

  // Re-run the rebuild and capture WHY it did or didn't write rows. This is the
  // same call dashboard-init makes on a history-less load, so a successful run
  // here also fills the chart.
  const backfillStatus = await backfillSnapshots(user.id);

  const afterRes = await supabase.from("snapshots").select("date").eq("user_id", user.id);
  const after = afterRes.data ?? [];
  const historicalAfter = after.filter((s) => s.date < today).length;

  return NextResponse.json(
    {
      now: today,
      backfillStatus,
      wroteHistoricalRows: historicalAfter - historicalBefore,
      guards: {
        isDemoUserId: !!process.env.DEMO_USER_ID && user.id === process.env.DEMO_USER_ID,
        hasDemoEntitlement: !!demoRes.data,
        entitlementReadError: demoRes.error?.message ?? null,
      },
      assets: { total: assets.length, heldTradeables },
      earliestMutationDate: earliestMutation,
      snapshots: {
        totalBefore: snaps.length,
        historicalBefore,
        historicalAfter,
        earliest: snaps[0]?.date ?? null,
        latest: snaps[snaps.length - 1]?.date ?? null,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
