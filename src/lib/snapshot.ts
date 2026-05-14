import * as Sentry from "@sentry/nextjs";
import { createServerSupabase } from "@/lib/supabase";
import { computeCurrentBalance } from "@/lib/mortgage";
import { fetchHistoricalPrice, normalizePrice } from "@/lib/prices";
import { getEurRates } from "@/lib/fx";

// TODO: live-price snapshots — tradeable asset values here are DB-stored, not real-time.
// Consider fetching live prices for each tradeable asset before writing the snapshot.
export async function writeSnapshot(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("type, value, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", userId);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    const now = new Date();
    const netTotal = assets.reduce((sum, a) => {
      if (a.type === "real_estate") {
        return sum + (a.value as number) - computeCurrentBalance(a, now);
      }
      return sum + (a.value as number);
    }, 0);

    const breakdown: Record<string, number> = {};
    for (const a of assets) {
      const contribution = a.type === "real_estate"
        ? (a.value as number) - computeCurrentBalance(a, now)
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

const TRADEABLE = new Set(["stocks", "etf", "crypto", "gold"]);

// Writes historical snapshots for each date an asset joined the portfolio.
// Uses ignoreDuplicates so cron-written rows are never overwritten.
export async function backfillSnapshots(userId: string): Promise<void> {
  try {
    const supabase = createServerSupabase();

    const { data: assets, error } = await supabase
      .from("assets")
      .select("id, type, value, symbol, units, buy_date, created_at, mortgage_balance, mortgage_balance_recorded_at, mortgage_rate, monthly_payment, mortgage_type")
      .eq("user_id", userId);

    if (error) throw error;
    if (!assets || assets.length === 0) return;

    const today = new Date().toISOString().slice(0, 10);

    // Collect unique inception dates that are strictly before today
    const datesSet = new Set<string>();
    for (const a of assets) {
      const inception = (a.buy_date ?? (a.created_at as string).slice(0, 10)) as string;
      if (inception < today) datesSet.add(inception);
    }
    if (datesSet.size === 0) return;

    const dates = [...datesSet].sort();
    const fx = await getEurRates();

    const rows: Array<{ user_id: string; date: string; total_value: number; breakdown: Record<string, number> }> = [];

    for (const date of dates) {
      const asOf = new Date(date + "T12:00:00Z");

      // Only assets whose inception is on or before this date
      const active = assets.filter((a) => {
        const inception = (a.buy_date ?? (a.created_at as string).slice(0, 10)) as string;
        return inception <= date;
      });
      if (active.length === 0) continue;

      // Fetch historical prices for all tradeables on this date in parallel
      const tradeables = active.filter((a) => TRADEABLE.has(a.type) && a.symbol && a.units);
      const priceResults = await Promise.all(
        tradeables.map((a) => fetchHistoricalPrice(a.symbol!, date))
      );
      const priceMap = new Map(tradeables.map((a, i) => [a.id, priceResults[i]]));

      let total = 0;
      const breakdown: Record<string, number> = {};

      for (const a of active) {
        let contribution: number;

        if (TRADEABLE.has(a.type) && a.symbol && a.units) {
          const priceData = priceMap.get(a.id);
          if (priceData) {
            const raw = normalizePrice(priceData.price, priceData.currency);
            const cur = priceData.currency === "GBp" ? "GBP" : priceData.currency;
            const native = raw * (a.units as number);
            contribution = cur === "EUR" ? native : (fx[cur] ? native / fx[cur] : (a.value as number));
            // Fix zero-value assets in place; live-price system corrects to current on next refresh
            if ((a.value as number) === 0) {
              await supabase.from("assets").update({
                value: Math.round(contribution),
                buy_price: Math.round(raw * 100) / 100,
              }).eq("id", a.id);
              (a as Record<string, unknown>).value = Math.round(contribution);
            }
          } else {
            contribution = a.value as number;
          }
        } else if (a.type === "real_estate") {
          contribution = (a.value as number) - computeCurrentBalance(a, asOf);
        } else {
          contribution = a.value as number;
        }

        total += contribution;
        breakdown[a.type as string] = (breakdown[a.type as string] ?? 0) + contribution;
      }

      rows.push({ user_id: userId, date, total_value: Math.round(total), breakdown });
    }

    if (rows.length === 0) return;

    const { error: upsertError } = await supabase.from("snapshots").upsert(rows, {
      onConflict: "user_id,date",
      ignoreDuplicates: true,
    });
    if (upsertError) throw upsertError;
  } catch (err) {
    Sentry.captureException(err, {
      tags: { fn: "backfillSnapshots" },
      extra: { user_id: userId },
    });
  }
}
