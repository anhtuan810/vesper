import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { isSupportedCurrency } from "@/lib/money";
import {
  applyModifications,
  compareScenarios,
  sanitizeModifications,
  type ScenarioAsset,
} from "@/lib/scenario/engine";

// POST /api/scenarios/compute
// Resolves the user from the session, reads their real current assets (source of
// truth), applies the client-sent modifications to an in-memory copy, and returns
// the Current vs Scenario comparison plus the display currency and current FX for
// client-side formatting. Read-only: never writes assets, mutations, or snapshots.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const modifications = sanitizeModifications((body as { modifications?: unknown })?.modifications);

  const supabase = createServerSupabase();

  const { data: rows, error } = await supabase
    .from("assets")
    .select(
      "id, name, type, value, currency, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type",
    )
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Failed to load assets" }, { status: 500 });

  const current = (rows ?? []) as ScenarioAsset[];
  const usdRates = await getUsdRates();

  // Clone-and-modify sandbox — the real `current` array is never mutated.
  const scenario = applyModifications(current, modifications);
  const comparison = compareScenarios(current, scenario, usdRates);

  const { data: urow } = await supabase
    .from("users")
    .select("display_currency")
    .eq("id", user.id)
    .single();
  const displayCurrency = isSupportedCurrency(urow?.display_currency) ? urow!.display_currency : "EUR";

  return NextResponse.json({ comparison, displayCurrency, usdRates });
}
