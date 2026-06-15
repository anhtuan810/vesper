import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";
import { writeVitalSnapshots } from "@/lib/vitals/persist";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
