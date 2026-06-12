import { createServerSupabase } from "@/lib/supabase";
import { serializeMarketDetail } from "@/lib/market-highlights";

// Fixed, deterministic demo portfolio for App Review. Reseeded on every /demo
// entry so a reviewer always lands on the same populated account and any edits
// they make never persist across entries. Every amount is EUR (the demo user's
// display currency), and every snapshot carries a native_breakdown in EUR, so
// the net-worth chart renders identically regardless of live FX or market data.
//
// The mutation invariant holds for seeded data: each seeded asset has a matching
// "add" mutation row recording how it entered the portfolio.

const todayIso = () => new Date().toISOString().slice(0, 10);

// ── Assets — current ("today") state ────────────────────────────────────────
// service-role insert writes real columns directly (not the API allowlist), so
// every schema column is available here.
function assetSeeds(): Array<Record<string, unknown>> {
  return [
    {
      type: "real_estate",
      name: "Apartment — Eindhoven",
      value: 575000,
      currency: "EUR",
      country: "NL",
      address: "Vestdijk 21, 5611 CA Eindhoven, Netherlands",
      latitude: 51.4381,
      longitude: 5.4797,
      property_type: "apartment",
      size_sqm: 96,
      mortgage_balance: 312000,
      mortgage_rate: 3.6,
      monthly_payment: 1685,
      mortgage_type: "annuity",
      mortgage_start_date: "2022-09-01",
      mortgage_end_date: "2052-09-01",
      // Recorded as of today so computeCurrentBalance returns the stored balance
      // (no drift): home equity stays a deterministic €263,000.
      mortgage_balance_recorded_at: todayIso(),
    },
    {
      type: "stocks",
      name: "ASML Holding",
      value: 38400,
      currency: "EUR",
      country: "NL",
      symbol: "ASML.AS",
      units: 40,
      buy_price: 612,
      buy_date: "2025-10-20",
      buy_price_source: "user",
    },
    {
      type: "etf",
      name: "iShares Core MSCI World",
      value: 47200,
      currency: "EUR",
      symbol: "IWDA.AS",
      units: 460,
      buy_price: 92.5,
      buy_date: "2025-07-05",
      buy_price_source: "user",
    },
    {
      type: "crypto",
      name: "Bitcoin",
      value: 21500,
      currency: "EUR",
      symbol: "BTC-EUR",
      units: 0.32,
      buy_price: 54000,
      buy_date: "2026-02-14",
      buy_price_source: "user",
    },
    {
      type: "cash",
      name: "Emergency fund",
      value: 18500,
      currency: "EUR",
      // mortgage_rate is repurposed as the interest rate for cash/pension.
      mortgage_rate: 1.6,
    },
    {
      type: "pension",
      name: "Brand New Day DC pension",
      value: 42000,
      currency: "EUR",
      pension_kind: "dc",
      monthly_contribution: 350,
      access_age: 67,
      mortgage_rate: 4.5,
      pension_provider: "Brand New Day",
    },
  ];
}

// ── Snapshots — ~12 monthly points so the chart has real history ────────────
const MONTHLY_TOTALS: Array<[string, number]> = [
  ["2025-07-01", 372000],
  ["2025-08-01", 379000],
  ["2025-09-01", 384000],
  ["2025-10-01", 390000],
  ["2025-11-01", 397000],
  ["2025-12-01", 403000],
  ["2026-01-01", 389000], // market pullback
  ["2026-02-01", 398000],
  ["2026-03-01", 407000],
  ["2026-04-01", 413000],
  ["2026-05-01", 417000],
  ["2026-06-01", 421000],
];

// Fixed category proportions (sum to 1.0), matching today's composition.
const BREAKDOWN_RATIOS: Record<string, number> = {
  real_estate: 0.61,
  etf: 0.115,
  pension: 0.1,
  stocks: 0.085,
  crypto: 0.05,
  cash: 0.04,
};

function snapshotRows(userId: string): Array<Record<string, unknown>> {
  return MONTHLY_TOTALS.map(([date, total]) => {
    const breakdown: Record<string, number> = {};
    for (const [type, ratio] of Object.entries(BREAKDOWN_RATIOS)) {
      breakdown[type] = Math.round(total * ratio);
    }
    return {
      user_id: userId,
      date,
      total_value: total,
      breakdown,
      native_breakdown: { EUR: total },
    };
  });
}

// Reseeds the demo user's portfolio to the fixed dataset above. Deletes existing
// assets, mutations, and snapshots (mutations first — they reference assets),
// then inserts the seed set. Throws on a critical insert failure so the caller
// can fall back to /login.
export async function seedDemoUser(userId: string): Promise<void> {
  const supabase = createServerSupabase();

  // A silently failed delete leaves stale rows (e.g. old cron-written
  // snapshots) under the fresh seed — the chart then renders the leftover
  // history with today's live tip as a bogus cliff. Fail the whole seed
  // instead, so /demo falls back to /login rather than presenting a
  // half-reset account.
  for (const table of ["mutations", "snapshots", "highlights", "assets"]) {
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

  // Each mutation is an "add" recording how/why the asset entered the portfolio,
  // spread across the past year with realistic reasoning notes — this drives the
  // diary. after_value is the value at acquisition; current value differs with
  // the market, as it would for a real account.
  const mut = (
    assetName: string,
    occurredAt: string,
    afterValue: number,
    afterUnits: number | null,
    personalContext: string,
    portfolioTotal: number,
    marketContext: string | null = null,
  ): Record<string, unknown> => {
    const a = byName.get(assetName);
    return {
      user_id: userId,
      asset_id: a?.id ?? null,
      asset_name: assetName,
      asset_type: a?.type ?? null,
      symbol: a?.symbol ?? null,
      action: "add",
      before_value: null,
      after_value: afterValue,
      before_units: null,
      after_units: afterUnits,
      currency: a?.currency ?? "EUR",
      personal_context: personalContext,
      market_context: marketContext,
      portfolio_total: portfolioTotal,
      occurred_at: occurredAt,
      recorded_at: `${occurredAt}T12:00:00Z`,
    };
  };

  const mutationRows = [
    mut(
      "iShares Core MSCI World",
      "2025-07-05",
      44000,
      460,
      "Started a monthly index plan into IWDA — broad global exposure at low cost. I stopped trying to pick winners and just want to own the market.",
      44000,
    ),
    mut(
      "Apartment — Eindhoven",
      "2025-08-20",
      575000,
      null,
      "Added the apartment and current mortgage so net worth finally reflects our home equity, not just the liquid accounts.",
      268000,
    ),
    mut(
      "Brand New Day DC pension",
      "2025-09-12",
      40000,
      null,
      "Logged my workplace DC pension. It's locked until 67, but it's real capital and should be part of the picture.",
      309000,
    ),
    mut(
      "ASML Holding",
      "2025-10-20",
      36500,
      40,
      "Bought ASML on the post-earnings dip. Long-term conviction in the AI supply chain — I work adjacent to semis and understand the moat.",
      346000,
      "Semiconductors had sold off broadly on a soft near-term guide; I treated it as an entry, not a warning.",
    ),
    mut(
      "Emergency fund",
      "2025-11-03",
      18500,
      null,
      "Set aside roughly six months of expenses as a separate emergency fund. Sleep-at-night money I won't touch for investing.",
      365000,
    ),
    mut(
      "Bitcoin",
      "2026-02-14",
      19800,
      0.32,
      "Opened a small Bitcoin position, deliberately capped near 5% of liquid assets. High conviction, but sized so a drawdown won't hurt.",
      398000,
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
      title: "ASML steady after earnings",
      detail: serializeMarketDetail({
        detail: "ASML held its level this week as semiconductor demand stayed firm. Your 40 shares moved with the sector, not against it.",
        impact_eur: 410,
        symbol: "ASML.AS",
      }),
    },
    {
      title: "World index grinds higher",
      detail: serializeMarketDetail({
        detail: "Global equities added modest gains, led by US large caps. IWDA is your broadest exposure, so most of this flows straight through.",
        impact_eur: 290,
        symbol: "IWDA.AS",
      }),
    },
    {
      title: "Bitcoin holds its range",
      detail: serializeMarketDetail({
        detail: "Bitcoin traded inside its recent range. Your position is capped near 5% of liquid assets, so the day-to-day swings stay background noise.",
        impact_eur: -120,
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

  // Make the account self-consistent for the chart (EUR display) and skip the
  // one-time AI disclosure gate so the reviewer isn't interrupted.
  await supabase
    .from("users")
    .update({
      name: "Alex Demo",
      display_currency: "EUR",
      ai_consent_at: new Date().toISOString(),
      fingerprint: "Long-term index core, a few conviction bets, anchored by home equity.",
    })
    .eq("id", userId);
}
