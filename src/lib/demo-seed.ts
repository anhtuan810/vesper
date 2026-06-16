import { createServerSupabase } from "@/lib/supabase";
import { serializeMarketDetail } from "@/lib/market-highlights";

// Fixed, deterministic demo portfolio for App Review and the public live demo.
// Reseeded on every /demo entry so a visitor always lands on the same populated
// account and any edits they make never persist across entries.
//
// Persona: "Alex", early 40s, Amsterdam. A relatable Dutch mass-affluent
// homeowner — a family apartment in Amsterdam plus a small still-mortgaged rental
// in Rotterdam, a global-index core, a few high-conviction tech names, a tiny
// Bitcoin position, a workplace pension and a cash buffer. ~€340k net worth, ~72%
// of it property equity. Display currency EUR; the only USD/live-priced holdings
// (NVIDIA, Apple) are a tiny sleeve, so today's live tip is a smooth continuation
// of the seeded history, never a cliff.
//
// History spans ~5 years (2021-01 → today) as monthly snapshots whose category
// breakdown evolves with the holdings (cash + ETF → +home 2021 → +crypto → +rental
// 2022 → +stocks → today), so the net-worth chart's All/3Y ranges and the Vitals
// real-growth series both tell a genuine multi-year growth story.
//
// The mutation invariant holds for seeded data: each seeded asset has a matching
// "add" mutation recording how it entered the portfolio. A handful of those
// entries — plus two recent top-ups — carry the real market backdrop of the
// moment (BTC's 2021 peak, the 2022 sell-off and rate spike, the 2023 SVB shock
// and AI rally), which is what makes the Diary read like a real journal.

const todayIso = () => new Date().toISOString().slice(0, 10);

// ── Assets — current ("today") state ────────────────────────────────────────
// service-role insert writes real columns directly (not the API allowlist), so
// every schema column is available here.
function assetSeeds(): Array<Record<string, unknown>> {
  return [
    {
      type: "real_estate",
      name: "Apartment — Amsterdam",
      value: 525000,
      currency: "EUR",
      country: "NL",
      address: "Eerste Helmersstraat 95, 1054 DZ Amsterdam, Netherlands",
      latitude: 52.3625,
      longitude: 4.8718,
      property_type: "apartment",
      size_sqm: 88,
      // buy_price + buy_date anchor the per-year indicative value chart (the CBS
      // estimate engine needs a purchase year to anchor the series).
      buy_price: 495000,
      buy_date: "2021-06-15",
      mortgage_balance: 335000,
      // 2021 was the era of sub-2% Dutch mortgages — kept low on the home, in
      // deliberate contrast with the rental taken out after rates spiked.
      mortgage_rate: 1.9,
      monthly_payment: 1390,
      mortgage_type: "annuity",
      mortgage_start_date: "2021-06-15",
      mortgage_end_date: "2051-06-15",
      // Recorded as of today so computeCurrentBalance returns the stored balance
      // (no drift): home equity stays a deterministic €190,000.
      mortgage_balance_recorded_at: todayIso(),
    },
    {
      type: "real_estate",
      name: "Rental — Rotterdam",
      value: 245000,
      currency: "EUR",
      country: "NL",
      address: "Mathenesserlaan 230, 3021 HV Rotterdam, Netherlands",
      latitude: 51.9151,
      longitude: 4.4561,
      property_type: "apartment",
      size_sqm: 62,
      buy_price: 235000,
      buy_date: "2022-09-10",
      // Interest-only and bought after the 2022 rate spike — the balance never
      // amortises, so equity is purely value minus the constant €185,000.
      mortgage_balance: 185000,
      mortgage_rate: 4.3,
      monthly_payment: 663,
      mortgage_type: "interest_only",
      mortgage_start_date: "2022-09-10",
      mortgage_end_date: "2052-09-10",
      mortgage_balance_recorded_at: todayIso(),
    },
    {
      type: "etf",
      name: "iShares Core MSCI World",
      value: 22000,
      currency: "EUR",
      symbol: "IWDA.AS",
      units: 240,
      buy_price: 83,
      buy_date: "2021-03-08",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "NVIDIA",
      value: 4500,
      currency: "USD",
      symbol: "NVDA",
      units: 35,
      // Split-adjusted blended cost (a 2023 entry topped up in 2026); live price
      // is split-adjusted too, so the gain reads correctly.
      buy_price: 36,
      buy_date: "2023-03-20",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "SpaceX",
      value: 3000,
      currency: "EUR",
      // Private/pre-listing holding: no public ticker, so no symbol — it shows at
      // its entered value and is never live-priced.
      buy_date: "2024-05-15",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "Apple",
      value: 2500,
      currency: "USD",
      symbol: "AAPL",
      units: 11,
      buy_price: 165,
      buy_date: "2023-08-12",
      buy_price_source: "user",
    },
    {
      type: "crypto",
      name: "Bitcoin",
      value: 4000,
      currency: "EUR",
      symbol: "BTC-EUR",
      units: 0.05,
      buy_price: 56000,
      buy_date: "2021-11-08",
      buy_price_source: "user",
    },
    {
      type: "cash",
      name: "Emergency fund",
      value: 20000,
      currency: "EUR",
      // mortgage_rate is repurposed as the interest rate for cash/pension.
      mortgage_rate: 1.8,
    },
    {
      type: "pension",
      name: "Brand New Day DC pension",
      value: 34000,
      currency: "EUR",
      pension_kind: "dc",
      monthly_contribution: 300,
      access_age: 67,
      mortgage_rate: 4.5,
      pension_provider: "Brand New Day",
    },
  ];
}

// ── Snapshots — ~5 years of monthly points with an evolving composition ──────
// Anchor points give each category's value (real_estate is EQUITY, i.e. value
// minus mortgage) at key dates; months in between are linearly interpolated, so
// the net-worth curve carries the home purchase (2021), the rental (2022), the
// 2022 sell-off dip and the recovery — and the area-by-category chart shows the
// portfolio genuinely diversifying over time. total_value is net worth;
// native_breakdown is the EUR bucket so the HISTORY renders identically
// regardless of live FX (only today's live tip reflects current US prices).
interface CategoryValues {
  real_estate: number;
  etf: number;
  stocks: number;
  crypto: number;
  pension: number;
  cash: number;
}

const SNAPSHOT_CATEGORIES: Array<keyof CategoryValues> = [
  "real_estate", "etf", "stocks", "crypto", "pension", "cash",
];

const SNAPSHOT_ANCHORS: Array<[string, CategoryValues]> = [
  // Pre-home: a large cash down-payment fund alongside a small index position.
  ["2021-01-01", { real_estate: 0,      etf: 16000, stocks: 0,     crypto: 0,    pension: 4000,  cash: 120000 }],
  // Bought the Amsterdam apartment — cash converts into home equity (€115k at
  // purchase: €495k value less a €380k mortgage), so net worth barely moves.
  ["2021-06-01", { real_estate: 115000, etf: 19000, stocks: 0,     crypto: 0,    pension: 6000,  cash: 8000  }],
  // First small Bitcoin buy near the cycle top.
  ["2021-11-01", { real_estate: 122000, etf: 21000, stocks: 0,     crypto: 4000, pension: 8000,  cash: 14000 }],
  // 2022 sell-off: equities and crypto down, cash rebuilt toward the next deposit.
  ["2022-06-01", { real_estate: 128000, etf: 18500, stocks: 0,     crypto: 1800, pension: 9000,  cash: 28000 }],
  // Bought the Rotterdam rental — €50k of cash becomes €50k of rental equity.
  ["2022-09-01", { real_estate: 178000, etf: 18000, stocks: 0,     crypto: 1900, pension: 9500,  cash: 6000  }],
  // First individual stock (NVIDIA) as the AI rally began.
  ["2023-03-01", { real_estate: 185000, etf: 20000, stocks: 2500,  crypto: 2600, pension: 11000, cash: 9000  }],
  ["2023-12-01", { real_estate: 195000, etf: 21500, stocks: 5500,  crypto: 3400, pension: 14000, cash: 12000 }],
  // Added the SpaceX stake; markets at highs.
  ["2024-09-01", { real_estate: 220000, etf: 22500, stocks: 9000,  crypto: 4200, pension: 20000, cash: 15000 }],
  ["2025-06-01", { real_estate: 240000, etf: 22000, stocks: 9500,  crypto: 4500, pension: 27000, cash: 17000 }],
  // Today: €250k property equity + €56k markets/cash + €34k pension ≈ €340k.
  ["2026-06-01", { real_estate: 250000, etf: 22000, stocks: 10000, crypto: 4000, pension: 34000, cash: 20000 }],
];

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function snapshotRows(userId: string): Array<Record<string, unknown>> {
  const anchorTimes = SNAPSHOT_ANCHORS.map(([d]) => Date.parse(`${d}T00:00:00Z`));
  const rows: Array<Record<string, unknown>> = [];

  const cursor = new Date("2021-01-01T00:00:00Z");
  const end = Date.parse("2026-06-01T00:00:00Z");

  while (cursor.getTime() <= end) {
    const t = cursor.getTime();

    // Surrounding anchors for this month.
    let lo = 0;
    while (lo < anchorTimes.length - 1 && anchorTimes[lo + 1] <= t) lo++;
    const hi = Math.min(lo + 1, SNAPSHOT_ANCHORS.length - 1);
    const span = anchorTimes[hi] - anchorTimes[lo];
    const frac = span > 0 ? Math.max(0, Math.min(1, (t - anchorTimes[lo]) / span)) : 0;
    const loVals = SNAPSHOT_ANCHORS[lo][1];
    const hiVals = SNAPSHOT_ANCHORS[hi][1];

    const breakdown: Record<string, number> = {};
    let total = 0;
    for (const cat of SNAPSHOT_CATEGORIES) {
      const v = Math.round(lerp(loVals[cat], hiVals[cat], frac));
      if (v > 0) breakdown[cat] = v;
      total += v;
    }

    rows.push({
      user_id: userId,
      date: cursor.toISOString().slice(0, 10),
      total_value: total,
      breakdown,
      native_breakdown: { EUR: total },
    });

    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return rows;
}

// Reseeds the demo user's portfolio to the fixed dataset above. Deletes existing
// assets, mutations, and snapshots (mutations first — they reference assets),
// then inserts the seed set. Throws on a critical insert failure so the caller
// can fall back to /login.
export async function seedDemoUser(userId: string): Promise<void> {
  const supabase = createServerSupabase();

  // Wipe every per-user table a reviewer can write to, so each /demo entry is a
  // truly fresh account and nothing from a previous reviewer's session (chat,
  // goals, saved scenarios, diary) carries over — matching the "edits never
  // persist across entries" guarantee above. mutations are deleted before assets
  // (they reference assets). A silently failed delete leaves stale rows (e.g. old
  // cron-written snapshots) under the fresh seed — the chart then renders the
  // leftover history with today's live tip as a bogus cliff — so fail the whole
  // seed instead, letting /demo fall back to /login rather than present a
  // half-reset account.
  for (const table of [
    "mutations", "snapshots", "highlights", "messages",
    "goals", "diary_summaries", "vital_snapshots", "scenarios", "assets",
  ]) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw error;
  }

  const { data: createdAssets, error: assetError } = await supabase
    .from("assets")
    .insert(assetSeeds().map((a) => ({ ...a, user_id: userId })))
    .select("id, name, type, currency, symbol");
  if (assetError) throw assetError;

  const byName = new Map(
    (createdAssets ?? []).map((a) => [a.name as string, a])
  );

  // Each mutation records how/why an asset entered or changed in the portfolio,
  // spread across the past five years with realistic reasoning notes — this drives
  // the diary. after_value is the value at the time of the entry; the current
  // value differs with the market, as it would for a real account. market_context
  // is set only on entries that coincide with a genuinely big market event.
  const baseMut = (
    assetName: string,
    occurredAt: string,
    personalContext: string,
    portfolioTotal: number,
    marketContext: string | null,
  ): Record<string, unknown> => {
    const a = byName.get(assetName);
    return {
      user_id: userId,
      asset_id: a?.id ?? null,
      asset_name: assetName,
      asset_type: a?.type ?? null,
      symbol: a?.symbol ?? null,
      currency: a?.currency ?? "EUR",
      personal_context: personalContext,
      market_context: marketContext,
      portfolio_total: portfolioTotal,
      occurred_at: occurredAt,
      recorded_at: `${occurredAt}T12:00:00Z`,
    };
  };

  const add = (
    assetName: string,
    occurredAt: string,
    afterValue: number,
    afterUnits: number | null,
    personalContext: string,
    portfolioTotal: number,
    marketContext: string | null = null,
  ): Record<string, unknown> => ({
    ...baseMut(assetName, occurredAt, personalContext, portfolioTotal, marketContext),
    action: "add",
    before_value: null,
    after_value: afterValue,
    before_units: null,
    after_units: afterUnits,
  });

  const topUp = (
    assetName: string,
    occurredAt: string,
    beforeValue: number,
    afterValue: number,
    beforeUnits: number,
    afterUnits: number,
    personalContext: string,
    portfolioTotal: number,
    marketContext: string | null = null,
  ): Record<string, unknown> => ({
    ...baseMut(assetName, occurredAt, personalContext, portfolioTotal, marketContext),
    action: "edit",
    before_value: beforeValue,
    after_value: afterValue,
    before_units: beforeUnits,
    after_units: afterUnits,
  });

  const mutationRows = [
    add(
      "iShares Core MSCI World",
      "2021-03-08",
      12000,
      150,
      "Opened a monthly index plan into a global MSCI World tracker. I stopped trying to pick winners and decided to just own the whole market and keep buying.",
      142000,
    ),
    add(
      "Apartment — Amsterdam",
      "2021-06-15",
      495000,
      null,
      "We bought our apartment in Amsterdam after years of renting. Logging the home and mortgage so net worth finally reflects where most of our money actually sits.",
      148000,
    ),
    add(
      "Brand New Day DC pension",
      "2021-09-01",
      8000,
      null,
      "Logged my workplace DC pension. It is locked until 67, but it is real capital and belongs in the full picture.",
      158000,
    ),
    add(
      "Bitcoin",
      "2021-11-08",
      2800,
      0.05,
      "Opened a small Bitcoin position, deliberately capped near a few percent of liquid assets. High conviction, sized so a drawdown cannot hurt.",
      169000,
      "Bitcoin had just set a record near 69,000 dollars; I bought into that euphoria but kept the position tiny on purpose.",
    ),
    add(
      "Emergency fund",
      "2022-02-15",
      15000,
      null,
      "Set aside roughly six months of expenses as a separate buffer. Sleep-at-night money I will not touch for investing.",
      178000,
    ),
    topUp(
      "iShares Core MSCI World",
      "2022-03-10",
      12750,
      17000,
      150,
      200,
      "Added to the world tracker while everything was red. I treated the sell-off as a discount on the same companies, not a reason to stop.",
      180000,
      "Markets were falling hard as war broke out in Ukraine and inflation spiked; I kept buying straight through it.",
    ),
    add(
      "Rental — Rotterdam",
      "2022-09-10",
      235000,
      null,
      "Bought a small rental apartment in Rotterdam. The rent comfortably covers the mortgage and it diversifies us beyond our own street.",
      213000,
      "Mortgage rates had jumped from under two percent to over four in a year; I locked in the rental knowing the rent would still cover the higher rate.",
    ),
    add(
      "NVIDIA",
      "2023-03-20",
      660,
      30,
      "Bought NVIDIA as the clearest pick-and-shovel play on AI compute. I would rather own the infrastructure than guess which model wins.",
      230000,
      "Bought just as the collapse of Silicon Valley Bank rattled markets and the AI rally was getting started.",
    ),
    add(
      "Apple",
      "2023-08-12",
      1815,
      11,
      "Added a core Apple position. Boring in the best way: a cash machine with a sticky ecosystem and relentless buybacks.",
      245000,
    ),
    add(
      "SpaceX",
      "2024-05-15",
      3000,
      null,
      "Took a small stake in SpaceX through a private share offering. A speculative, illiquid slice I am happy to leave untouched for years.",
      280000,
    ),
    topUp(
      "iShares Core MSCI World",
      "2025-10-14",
      19000,
      22800,
      200,
      240,
      "Kept the monthly index plan running and topped up again. The most reliable thing I do is buy a little every month and ignore the noise.",
      325000,
    ),
    topUp(
      "NVIDIA",
      "2026-02-18",
      3600,
      4200,
      30,
      35,
      "Added a little more NVIDIA. Letting a winner run, but only inside a sleeve I have sized to sleep through.",
      335000,
    ),
  ];

  const { error: mutationError } = await supabase.from("mutations").insert(mutationRows);
  if (mutationError) throw mutationError;

  const { error: snapshotError } = await supabase.from("snapshots").insert(snapshotRows(userId));
  if (snapshotError) throw snapshotError;

  // Market highlights are normally written by the daily 07:00 cron, so a
  // freshly reseeded demo account would show an empty market section until the
  // next run — bad for App Review. Seed deterministic, evergreen items tied to
  // the demo holdings instead; they expire on the cron's usual 24h horizon and
  // every /demo entry re-creates them.
  const marketExpiry = new Date(Date.now() + 86_400_000).toISOString();
  const marketSeeds = [
    {
      title: "NVIDIA steady after earnings",
      detail: serializeMarketDetail({
        detail: "NVIDIA held its level this week as AI-chip demand stayed firm. Your 35 shares moved with the sector, not against it.",
        impact_eur: 240,
        symbol: "NVDA",
      }),
    },
    {
      title: "World index grinds higher",
      detail: serializeMarketDetail({
        detail: "Global equities added modest gains, led by US large caps. Your MSCI World tracker is the broadest exposure you hold, so most of this flows straight through.",
        impact_eur: 180,
        symbol: "IWDA.AS",
      }),
    },
    {
      title: "Bitcoin holds its range",
      detail: serializeMarketDetail({
        detail: "Bitcoin traded inside its recent range. Your position is capped near a few percent of liquid assets, so the day-to-day swings stay background noise.",
        impact_eur: -70,
        symbol: "BTC-EUR",
      }),
    },
  ];
  const { error: highlightError } = await supabase.from("highlights").insert(
    marketSeeds.map((h) => ({
      user_id: userId,
      type: "market",
      title: h.title,
      detail: h.detail,
      expires_at: marketExpiry,
      seen: false,
    }))
  );
  if (highlightError) throw highlightError;

  // Grant the demo account full access. The paywall-first gate (src/components/
  // Paywall.tsx) covers every signed-in user who isn't trialing/active, so without
  // an entitlement the reviewer would hit the paywall instead of the populated app.
  // Seeded as an active App Store annual subscription (what a real iOS subscriber
  // sees: "Purchased via App Store", a far-future renewal, a Manage link that opens
  // a valid store URL). Upserted so every reseed keeps the single per-user row
  // consistent; not real billing — purely to unlock the demo. product_id "demo"
  // is the signal the UI uses to hide real billing surfaces (SubscriptionView.isDemo).
  const demoPeriodEnd = new Date(Date.now() + 365 * 86_400_000).toISOString();
  const { error: entitlementError } = await supabase
    .from("entitlements")
    .upsert(
      {
        user_id: userId,
        status: "active",
        source: "app_store",
        plan: "annual",
        current_period_end: demoPeriodEnd,
        trial_end: null,
        cancel_at_period_end: false,
        product_id: "demo",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  if (entitlementError) throw entitlementError;

  // Make the account self-consistent for the chart (EUR display), skip the
  // one-time AI disclosure gate so the reviewer isn't interrupted, and give the
  // persona a strong, coherent profile — it shows on Profile and feeds Chat and
  // Insights, so the whole app reads as if it already knows this investor.
  await supabase
    .from("users")
    .update({
      name: "Alex Demo",
      display_currency: "EUR",
      ai_consent_at: new Date().toISOString(),
      fingerprint: "Amsterdam homeowner with a Rotterdam rental, a global-index core, and a few high-conviction tech bets.",
      profile: {
        life_and_direction:
          "Early forties, lives in Amsterdam with a partner and two children, dual income across tech and healthcare. Owns the family apartment and a small Rotterdam rental, and wants the next decade to be about compounding quietly rather than chasing the next thing.",
        approach:
          "Index-first. A global MSCI World position is the core, topped up through every dip. Around it sits a small sleeve of high-conviction names — NVIDIA, a pre-listing SpaceX stake and Apple — and a deliberately tiny Bitcoin position. Property is treated as a long-term hold with leverage kept conservative.",
        currently_exploring:
          "Whether to overpay the 1.9 percent home mortgage or keep investing the difference, and how much of the Rotterdam rental's cash flow to reinvest versus hold as buffer.",
        worth_raising:
          "The Rotterdam mortgage is interest-only, so the principal needs a repayment plan before it matures. The tech sleeve has also grown faster than expected and is now a larger share of liquid assets than originally intended.",
      },
    })
    .eq("id", userId);
}
