// One-off repair for the interleaved-snapshot bug.
//
// Symptom: a sawtooth net-worth chart after adding/removing assets. Root cause
// (now fixed): hard-deleting a removed asset destroyed the data backfill needed
// to reconstruct it, AND the backfill date lattice drifted day-to-day while
// rows were upsert-SKIPPED — so each run inserted fresh-vintage rows BETWEEN a
// previous run's, computed from a different asset set. The result was rows that
// alternated between "asset present" and "asset absent" totals.
//
// The code fixes (apply-changes.ts, snapshot.ts) stop NEW corruption:
//   - remove = soft-delete ("sold", history kept) or hard-delete+rebuild
//     ("mistake", erased); both keep the data backfill needs.
//   - calendar-anchored date lattice + overwrite-on-conflict, so every run
//     heals stale rows instead of interleaving with them.
//   - a non-destructive guard that aborts before writing if a held symbol's
//     price history failed to load.
//
// This script repairs rows ALREADY written before the fix: for each affected
// user it forces a full clean rebuild of [earliest, today) — delete + recompute
// from the current asset set — then refreshes today's live row. Passing a very
// early rebuildFrom makes backfillSnapshots clamp rebuildStart to the user's
// real earliest date, so the entire history is rebuilt consistently.
//
// Run:  npx tsx scripts/repair-snapshot-history.ts [userId]
//   - with a userId: repair just that user.
//   - without:       repair every user that has at least one snapshot row.
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (same as the API routes / cron), plus network access to Yahoo
// Finance (price history) and the FX provider for the rebuild.

import { createServerSupabase } from "../src/lib/supabase";
import { backfillSnapshots, writeSnapshot } from "../src/lib/snapshot";

// Earlier than any real acquisition — backfillSnapshots clamps the rebuild
// start to the user's own earliest date, so this means "rebuild everything".
const FROM_BEGINNING = "2000-01-01";

async function repairUser(userId: string): Promise<void> {
  // Full clean rebuild of all historical rows, then refresh today's live row.
  await backfillSnapshots(userId, FROM_BEGINNING);
  await writeSnapshot(userId);
}

async function main() {
  const argUser = process.argv[2]?.trim();
  const supabase = createServerSupabase();

  let userIds: string[];
  if (argUser) {
    userIds = [argUser];
  } else {
    // Distinct users that have any snapshot history to repair. Paginate so a
    // large table doesn't get truncated at the default 1000-row cap.
    const ids = new Set<string>();
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("snapshots")
        .select("user_id")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const row of data) ids.add(row.user_id as string);
      if (data.length < PAGE) break;
    }
    userIds = [...ids];
  }

  console.log(`Repairing snapshot history for ${userIds.length} user(s)…`);
  let ok = 0;
  let failed = 0;
  for (const userId of userIds) {
    try {
      await repairUser(userId);
      ok++;
      console.log(`  ✓ ${userId}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${userId}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`Done. ${ok} repaired, ${failed} failed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
