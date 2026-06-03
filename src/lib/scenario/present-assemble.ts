// DB wrapper for the present-scenario assembly. Read-only.
import { getUsdRates } from "@/lib/fx";
import { isSupportedCurrency, type DisplayCurrency } from "@/lib/money";
import type { Modification, ScenarioAsset, UsdRates, Comparison } from "@/lib/scenario/engine";
import { computePresentComparison } from "@/lib/scenario/present-compute";
import type { createServerSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

const ASSET_COLUMNS =
  "id, name, type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type";

export interface PresentResult {
  comparison: Comparison;
  displayCurrency: DisplayCurrency;
  usdRates: UsdRates;
  current: ScenarioAsset[];
}

export async function assemblePresent(
  supabase: SupabaseClient,
  userId: string,
  mods: Modification[],
): Promise<PresentResult> {
  const { data: rows } = await supabase.from("assets").select(ASSET_COLUMNS).eq("user_id", userId);
  const current = (rows ?? []) as ScenarioAsset[];
  const usdRates = await getUsdRates();
  const comparison = computePresentComparison(current, mods, usdRates);

  const { data: urow } = await supabase.from("users").select("display_currency").eq("id", userId).single();
  const displayCurrency = isSupportedCurrency(urow?.display_currency) ? urow!.display_currency : "EUR";

  return { comparison, displayCurrency, usdRates, current };
}
