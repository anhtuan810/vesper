import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";
import { writeVitalSnapshots } from "@/lib/vitals/persist";
import { generateMarketSwings } from "@/lib/diary-market-moves";
import { assertCron } from "@/lib/cron-auth";

export async function GET(req: NextRequest) {
  const denied = assertCron(req);
  if (denied) return denied;

  const supabase = createServerSupabase();
  const { data: rows } = await supabase.from("assets").select("user_id");

  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];

  await Promise.all(
    userIds.map(async (userId) => {
      await writeSnapshot(userId);
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
