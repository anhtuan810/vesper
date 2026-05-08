import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";

export async function writeSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("type, value, mortgage_balance")
      .eq("user_id", userId);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    let netTotal = 0;
    const breakdown: Record<string, number> = {};

    for (const a of assets) {
      const gross = a.value as number;
      const net =
        a.type === "real_estate" && a.mortgage_balance
          ? gross - (a.mortgage_balance as number)
          : gross;

      netTotal += net;
      breakdown[a.type as string] = (breakdown[a.type as string] ?? 0) + gross;
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
