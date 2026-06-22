import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { DEMO_USER_TABLES } from "@/lib/demo-seed";
import { DEMO_SESSION_TTL_MS, DEMO_SESSION_GRACE_MS } from "@/lib/demo-session";

// Reaps expired per-visitor demo accounts. Runs every 15 minutes (vercel.json),
// but the cron cadence has no bearing on session length — that is the per-user
// TTL the chat/mutation guards enforce. Here we only delete accounts already well
// past their hour (TTL + grace), so a request landing at the boundary is walled,
// not served against half-deleted data.
//
// Safety invariant: the reaper ONLY ever deletes uids present in demo_users. It
// never enumerates auth.users, so a real account can never be caught up in a reap.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const cutoff = new Date(Date.now() - (DEMO_SESSION_TTL_MS + DEMO_SESSION_GRACE_MS)).toISOString();

  const { data: expired, error } = await supabase
    .from("demo_users")
    .select("user_id")
    .lt("created_at", cutoff);
  if (error) {
    Sentry.captureException(error, { tags: { fn: "cron/reap-demo", step: "select" } });
    return NextResponse.json({ error: "Reap failed" }, { status: 500 });
  }

  const uids = (expired ?? []).map((r) => r.user_id as string);
  let reaped = 0;

  for (const uid of uids) {
    try {
      // 1. Per-user data rows (the same set seedDemoUser wipes). Deleted first, so
      //    even if any FK lacks ON DELETE CASCADE the data is provably gone.
      for (const table of DEMO_USER_TABLES) {
        const { error: delError } = await supabase.from(table).delete().eq("user_id", uid);
        if (delError) throw new Error(`Failed deleting ${table}: ${delError.message}`);
      }

      // 2. The auth user — cascades the public.users row and anything keyed to it
      //    (entitlements, rate_limits), invalidating the demo session entirely.
      const { error: authError } = await supabase.auth.admin.deleteUser(uid);
      if (authError) throw new Error(`Failed deleting auth user: ${authError.message}`);

      // 3. The tracking row (a no-op if step 2 already cascaded it away).
      const { error: rowError } = await supabase.from("demo_users").delete().eq("user_id", uid);
      if (rowError) throw new Error(`Failed deleting demo_users row: ${rowError.message}`);

      reaped++;
    } catch (err) {
      // One bad uid must not abort the run — log and move on; it retries next cron.
      Sentry.captureException(err, {
        tags: { fn: "cron/reap-demo", step: "delete" },
        extra: { user_id: uid },
      });
    }
  }

  return NextResponse.json({ ok: true, expired: uids.length, reaped });
}
