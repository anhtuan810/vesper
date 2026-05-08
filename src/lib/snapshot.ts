import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import { computeNetWorth } from "@/lib/utils";

// TODO: live-price snapshots — tradeable asset values here are DB-stored, not real-time.
// Consider fetching live prices for each tradeable asset before writing the snapshot.
export async function writeSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("type, value, mortgage_balance")
      .eq("user_id", userId);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    const netTotal = computeNetWorth(assets as Array<{ type: string; value: number; mortgage_balance?: number | null }>);
    const breakdown: Record<string, number> = {};

    for (const a of assets) {
      const contribution = a.type === "real_estate"
        ? (a.value as number) - ((a.mortgage_balance as number | null) ?? 0)
        : (a.value as number);
      breakdown[a.type as string] = (breakdown[a.type as string] ?? 0) + contribution;
    }

    const today = new Date().toISOString().slice(0, 10);

    const { error: upsertError } = await supabase.from("snapshots").upsert(
      { user_id: userId, total_value: netTotal, breakdown, date: today },
      { onConflict: "user_id,date" }
    );

    if (upsertError) throw upsertError;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "writeSnapshot" },
      extra: { user_id: userId },
    });
  }
}
