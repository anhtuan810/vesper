import { createServerSupabase } from "@/lib/supabase";
import { getUsdRates } from "@/lib/fx";
import { convertCurrency } from "@/lib/currency-convert";
import { computeNetWorth } from "@/lib/utils";
import { isIncomePension } from "@/lib/pension";
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
    supabase.from("assets").select("*").eq("user_id", userId).is("removed_at", null),
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

  // Normalize every asset value to EUR so all vital modules operate on a single
  // currency basis. The mortgage balance AND monthly payment are normalized too —
  // computeCurrentBalance amortizes the balance using the payment, so both must be
  // in the same currency as value, or a non-EUR property yields a wrong equity
  // (EUR value − native-currency balance). The rate is a percentage — no conversion.
  // For an all-EUR account this is an identity transform — convertCurrency
  // returns the amount unchanged when currency === "EUR" (no rate touched, no
  // drift). The native→USD→EUR double bridge survives only as the fallback
  // for a missing rate.
  const toEur = (amount: number, currency: string): number => {
    const v = convertCurrency(amount, currency || "USD", "EUR", fxRates);
    return v != null ? v : toUsdSync(amount, currency) * eurRate;
  };
  const normalizedAssets: Asset[] = assets.map((a) => {
    const cur = a.currency || "USD";
    // Income pensions (db/state) carry a null value — there's nothing to EUR-normalize,
    // and the vitals filter them out anyway. Pass through untouched so a null value
    // never becomes NaN.
    if (isIncomePension(a)) return a;
    if (a.type === "real_estate") {
      return {
        ...a,
        value: toEur(a.value, cur),
        mortgage_balance: a.mortgage_balance != null ? toEur(a.mortgage_balance, cur) : a.mortgage_balance,
        monthly_payment: a.monthly_payment != null ? toEur(a.monthly_payment, cur) : a.monthly_payment,
      };
    }
    return { ...a, value: toEur(a.value, cur) };
  });

  // Snapshots are written in USD (writeSnapshot / backfillSnapshots sum each
  // contribution through toUsd). The vital modules compare snapshot figures
  // against the EUR-normalized assets above — realGrowth's 12-month nominal
  // delta (nowNetWorth EUR vs baseline.total_value) and leverage's historical
  // LTV trend (EUR property value − breakdown.real_estate) — so the snapshot
  // total_value and per-type breakdown MUST be on the same EUR basis, or the
  // comparison mixes currencies and a genuinely flat year reads as ±the USD/EUR
  // offset (~8%). Convert at today's USD→EUR rate — the same single-rate
  // treatment the net-worth chart applies to historical USD rows; in the growth
  // ratio the rate cancels, leaving the true native move.
  const normalizedSnapshots: Snapshot[] = snapshots.map((s) => ({
    date: s.date,
    total_value: s.total_value * eurRate,
    breakdown: s.breakdown
      ? Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, v * eurRate]))
      : s.breakdown,
  }));

  return { user, assets: normalizedAssets, snapshots: normalizedSnapshots, netWorthEur, fxRates };
}
