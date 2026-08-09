import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { writeSnapshot, backfillSnapshots, bookFloorDate } from "@/lib/snapshot";
import { writeVitalSnapshots } from "@/lib/vitals/persist";
import { generateMarketSwings } from "@/lib/diary-market-moves";
import { assertCron } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;

  const supabase = createServerSupabase();
  const { data: rows } = await supabase.from("assets").select("user_id");

  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];
  const todayStr = new Date().toISOString().slice(0, 10);

  await Promise.all(
    userIds.map(async (userId) => {
      await writeSnapshot(userId);

      // Self-heal history, on two conditions — both cheap to test, both fixed by
      // the same background rebuild (run here, where no user waits on it):
      //
      //  (1) NO snapshot before today. The chart is stuck as a single dot because
      //      an earlier backfill was blocked (the demo guard's schema error, a
      //      transient outage, a deploy predating the fix).
      //  (2) The OLDEST snapshot predates everything the current book can date
      //      itself from. Those rows are residue of an erased holding — remove a
      //      house that was your oldest asset and, back when backfillSnapshots
      //      rebuilt only a scoped range, the years it alone occupied survived
      //      as stale points ending in a cliff. Rebuilding the WHOLE history
      //      (which is now the only mode) makes that impossible going forward;
      //      this condition is what gets one rebuild to run for an account still
      //      carrying the residue, and it stops firing once it has. bookFloorDate
      //      returns null when the book can't be dated at all — never treated as
      //      "it's all residue".
      try {
        const [{ data: oldest }, floor] = await Promise.all([
          supabase
            .from("snapshots")
            .select("date")
            .eq("user_id", userId)
            .lt("date", todayStr)
            .order("date", { ascending: true })
            .limit(1),
          bookFloorDate(userId),
        ]);
        const oldestDate = (oldest?.[0]?.date as string | undefined) ?? null;
        const hasResidue = oldestDate != null && floor != null && oldestDate < floor;
        if (oldestDate == null || hasResidue) {
          const status = await backfillSnapshots(userId);
          if (!status.startsWith("ok")) {
            Sentry.captureMessage("cron/snapshot: history self-heal wrote no rows", {
              level: "warning",
              tags: { fn: "cron/snapshot", step: "historySelfHeal" },
              extra: { user_id: userId, status, oldestDate, floor, hasResidue },
            });
          }
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { fn: "cron/snapshot", step: "historySelfHeal" },
          extra: { user_id: userId },
        });
      }

      try {
        await writeVitalSnapshots(supabase, userId);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { fn: "cron/snapshot", step: "writeVitalSnapshots" },
          extra: { user_id: userId },
        });
      }
      // Refresh market-swing entries daily so a new >=2% day appears even when the
      // user hasn't touched their data. Self-contained + error-swallowing.
      await generateMarketSwings(userId);
    }),
  );

  // Prune the webhook-idempotency ledger so it doesn't grow unbounded. Entries far
  // older than any provider's retry window can never collide with a live delivery,
  // so they're safe to drop. Best-effort: a failure here must not fail the cron.
  try {
    const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
    await supabase.from("billing_events").delete().lt("received_at", cutoff);
  } catch (err) {
    Sentry.captureException(err, { tags: { fn: "cron/snapshot", step: "pruneBillingEvents" } });
  }

  return NextResponse.json({ ok: true, users: userIds.length });
}
