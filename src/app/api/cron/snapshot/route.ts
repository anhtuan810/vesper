import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { writeSnapshot, backfillSnapshots } from "@/lib/snapshot";
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

      // Self-heal history: if a user has NO snapshot before today, their chart is
      // stuck as a single dot (an earlier backfill was blocked — e.g. the demo
      // guard's schema error, a transient outage, or a deploy that predates the
      // fix). Rebuild it here, in the background where no user waits on the
      // response, so the graph fills without needing a chat edit or a manual
      // trigger. Gated on a cheap count so the heavy rebuild only runs for
      // genuinely history-less accounts; the status is logged when it can't write.
      try {
        const { count } = await supabase
          .from("snapshots")
          .select("date", { count: "exact", head: true })
          .eq("user_id", userId)
          .lt("date", todayStr);
        if (!count) {
          const status = await backfillSnapshots(userId);
          if (!status.startsWith("ok")) {
            Sentry.captureMessage("cron/snapshot: history self-heal wrote no rows", {
              level: "warning",
              tags: { fn: "cron/snapshot", step: "historySelfHeal" },
              extra: { user_id: userId, status },
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
