// One-off repair for the cost-basis valuation bug: a chat-added tradeable's
// `value` was set to units x buy_price (cost basis) at insert time and never
// refreshed to market, so writeSnapshot wrote cost-basis rows for 2026-06-10
// and 2026-06-11, diverging from the market-priced backfill (the dip).
//
// The underlying bug is fixed in apply-changes.ts (value now comes from a live
// price at add time) and snapshot.ts (writeSnapshot now values held tradeables
// from the latest market close, not the DB `value`). This script repairs the
// data already written before that fix:
//
//   1. Finds the affected AAPL asset (value=734125, buy_price=73.41,
//      buy_price_source=NULL, created 2026-06-10) and corrects `assets.value`
//      to units x latest market price.
//   2. Rebuilds the 2026-06-10 snapshot row at market price via
//      backfillSnapshots(userId, "2026-06-10").
//   3. Re-runs writeSnapshot(userId) so today's row (2026-06-11) is recomputed
//      at market price under the fixed writeSnapshot.
//
// Run:  npx tsx scripts/repair-tradeable-value.ts
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (same as the API routes / cron), plus network access to Yahoo
// Finance for the live price and snapshot rebuild.

import { createServerSupabase } from "../src/lib/supabase";
import { backfillSnapshots, writeSnapshot } from "../src/lib/snapshot";
import { fetchYahooPrice } from "../src/lib/prices-server";

async function main() {
  const supabase = createServerSupabase();

  const { data: assets, error } = await supabase
    .from("assets")
    .select("id, user_id, symbol, units, value, currency, buy_price, buy_price_source, created_at")
    .eq("symbol", "AAPL")
    .eq("value", 734125)
    .eq("buy_price", 73.41)
    .is("buy_price_source", null)
    .gte("created_at", "2026-06-10")
    .lt("created_at", "2026-06-11");

  if (error) throw error;
  if (!assets || assets.length === 0) {
    console.log("No matching AAPL asset found — nothing to repair.");
    return;
  }

  for (const asset of assets) {
    const symbol = asset.symbol as string;
    const units = asset.units as number;
    const userId = asset.user_id as string;

    const live = await fetchYahooPrice(symbol);
    if (live.error || !live.price) {
      console.error(`Couldn't fetch a live price for ${symbol} — skipping asset ${asset.id}`);
      continue;
    }

    const marketValue = Math.round(live.price * units);
    console.log(`${symbol} (${asset.id}, user ${userId}): value ${asset.value} -> ${marketValue} (units=${units}, price=${live.price} ${live.nativeCurrency})`);

    const { error: updateError } = await supabase
      .from("assets")
      .update({ value: marketValue, currency: live.nativeCurrency })
      .eq("id", asset.id);
    if (updateError) throw updateError;

    console.log(`Rebuilding 2026-06-10 snapshot for user ${userId}...`);
    await backfillSnapshots(userId, "2026-06-10");

    console.log(`Recomputing today's snapshot for user ${userId}...`);
    await writeSnapshot(userId);

    console.log(`Done for user ${userId}.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
