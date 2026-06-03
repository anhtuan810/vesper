// DB wrapper for the future-projection assembly. Read-only.
import { getUsdRates } from "@/lib/fx";
import type { ScenarioAsset } from "@/lib/scenario/engine";
import { computeProjection, type ProjectResult } from "@/lib/scenario/project-compute";
import type { createServerSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

export async function assembleProject(
  supabase: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
): Promise<ProjectResult> {
  const now = new Date();
  const [{ data: assetRows }, { data: snapRows }] = await Promise.all([
    supabase
      .from("assets")
      .select("id, name, type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", userId),
    supabase.from("snapshots").select("date, total_value").eq("user_id", userId).order("date", { ascending: true }),
  ]);
  const assets = (assetRows ?? []) as ScenarioAsset[];
  const snapshots = (snapRows ?? []) as Array<{ date: string; total_value: number }>;
  const usdRates = await getUsdRates();

  let goal: { target_value?: number | null; target_date?: string | null } | null = null;
  if (body.mode === "solve" && (typeof body.targetUsd !== "number" || typeof body.date !== "string")) {
    const { data } = await supabase
      .from("goals")
      .select("target_value, target_date, title")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    goal = data ?? null;
  }

  return computeProjection({ assets, snapshots, usdRates, now }, body, goal);
}
