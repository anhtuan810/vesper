import { createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { computeNetWorth } from "@/lib/utils";
import type { Asset } from "@/lib/supabase";
import type { Snapshot } from "@/lib/vitals/types";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

export const VITALS_SNAPSHOT_WINDOW_DAYS = 400;

export interface VitalsInputs {
  user: Record<string, unknown>;
  assets: Asset[];
  snapshots: Snapshot[];
  netWorthEur: number;
  fxRates: Record<string, number>;
}

export async function buildVitalsInputs(
  supabase: SupabaseClient,
  userId: string,
): Promise<VitalsInputs> {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - VITALS_SNAPSHOT_WINDOW_DAYS);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const [userRes, assetsRes, snapshotsRes, fxRates] = await Promise.all([
    supabase
      .from("users")
      .select("display_currency, country, birth_year")
      .eq("id", userId)
      .single(),
    supabase.from("assets").select("*").eq("user_id", userId),
    supabase
      .from("snapshots")
      .select("date, total_value, breakdown")
      .eq("user_id", userId)
      .gte("date", cutoffStr)
      .order("date", { ascending: true }),
    getUsdRates(),
  ]);

  const user = (userRes.data ?? {}) as Record<string, unknown>;
  const assets = (assetsRes.data ?? []) as Asset[];
  const snapshots = (snapshotsRes.data ?? []) as Snapshot[];

  const toUsdSync = (amount: number, currency: string): number => {
    if (currency === "USD") return amount;
    const rate = fxRates[currency];
    return rate ? amount / rate : amount;
  };
  const eurRate = fxRates["EUR"] ?? 1;
  const netWorthUsd = computeNetWorth(assets, toUsdSync);
  const netWorthEur = netWorthUsd * eurRate;

  // Normalize every asset value to EUR so all vital modules operate on a
  // single currency basis. For an all-EUR account this is an identity transform.
  const normalizedAssets: Asset[] = assets.map((a) => ({
    ...a,
    value: toUsdSync(a.value, a.currency || "USD") * eurRate,
  }));

  return { user, assets: normalizedAssets, snapshots, netWorthEur, fxRates };
}
