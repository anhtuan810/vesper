import { createServerSupabase } from "@/lib/supabase";
import { serializeMarketDetail } from "@/lib/market-highlights";

// Fixed, deterministic demo portfolio for App Review and the public live demo.
// Reseeded on every /demo entry so a visitor always lands on the same populated
// account and any edits they make never persist across entries.
//
// Persona: "Alex", early 40s, Amsterdam. A relatable Dutch mass-affluent
// homeowner — a family apartment in Amsterdam plus a small still-mortgaged rental
// in Rotterdam, a global-index core, a few high-conviction tech names, a tiny
// Bitcoin position, a workplace pension and a cash buffer. ~€400k net worth,
// ~62% of it property equity. Display currency EUR.
//
// INVARIANT (see docs/audits/demo-networth-cliff.md): the chart's live "today"
// tip marks the tradeables to CURRENT prices, while this history is fixed EUR.
// The NEWEST anchor's liquid sleeve (etf + stocks + crypto) must therefore be
// kept ≈ the live mark of the seeded units, or the last chart segment draws a
// vertical step instead of a continuation. Re-mark it when prices drift far
// (audit 2026-06: live liquid ≈ €90.7k).
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

// Recent-window dates anchored to the moment of reseed, so the Diary's 1W/1M/3M
// filters are always populated no matter when a visitor enters the demo (the
// fixed-date history below only reaches 2026-02, which would leave those ranges
// empty).
const daysAgo = (n: number): string =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

// Every per-user table a demo visitor can write to. seedDemoUser wipes these on
// entry (a no-op on a fresh anonymous user) so nothing carries across sessions,
// and the reap-demo cron deletes the same set when an expired demo account is
// wiped. mutations precede assets because mutations reference assets. entitlements
// and the users/auth row are not listed here — the reaper removes the auth user
// (which cascades them); the seed re-grants the entitlement below.
export const DEMO_USER_TABLES = [
  "mutations", "snapshots", "highlights", "messages",
  "goals", "diary_summaries", "vital_snapshots", "scenarios", "assets",
] as const;

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
      value: 30000,
      currency: "EUR",
      symbol: "IWDA.AS",
      units: 320,
      buy_price: 83,
      buy_date: "2021-03-08",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "NVIDIA",
      value: 5000,
      currency: "USD",
      symbol: "NVDA",
      units: 40,
      // Split-adjusted blended cost (a 2023 entry topped up in 2026); live price
      // is split-adjusted too, so the gain reads correctly.
      buy_price: 36,
      buy_date: "2023-03-20",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "SpaceX",
      value: 3800,
      currency: "USD",
      // Now publicly traded — rendered as an ordinary stock. SPCX is a placeholder
      // ticker; if it doesn't resolve to a live quote the holding falls back to its
      // stored value, with the gain read against the 20 x $161 IPO cost basis.
      symbol: "SPCX",
      units: 20,
      buy_price: 161,
      buy_date: "2024-05-15",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "Apple",
      value: 3000,
      currency: "USD",
      symbol: "AAPL",
      units: 16,
      buy_price: 165,
      buy_date: "2023-08-12",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "Micron Technology",
      value: 3500,
      currency: "USD",
      symbol: "MU",
      units: 30,
      buy_price: 90,
      buy_date: "2024-07-15",
      buy_price_source: "user",
    },
    {
      type: "stocks",
      name: "Microsoft",
      value: 3500,
      currency: "USD",
      symbol: "MSFT",
      units: 9,
      buy_price: 370,
      buy_date: "2024-02-22",
      buy_price_source: "user",
    },
    {
      type: "crypto",
      name: "Bitcoin",
      value: 5500,
      currency: "EUR",
      symbol: "BTC-EUR",
      units: 0.07,
      buy_price: 56000,
      buy_date: "2021-11-08",
      buy_price_source: "user",
    },
    {
      type: "crypto",
      name: "Ethereum",
      value: 3500,
      currency: "EUR",
      symbol: "ETH-EUR",
      units: 1.1,
      buy_price: 2400,
      buy_date: "2024-01-18",
      buy_price_source: "user",
    },
    {
      type: "cash",
      name: "Emergency fund",
      value: 26000,
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
  // Bought the Amsterdam apartment — cash converts into home equity, so net worth
  // barely moves; cash then rebuilds toward the rental deposit.
  ["2021-06-01", { real_estate: 115000, etf: 19000, stocks: 0,     crypto: 0,    pension: 6000,  cash: 12000 }],
  // First small Bitcoin buy near the cycle top.
  ["2021-11-01", { real_estate: 125000, etf: 21000, stocks: 0,     crypto: 4000, pension: 8000,  cash: 16000 }],
  // 2022 sell-off: equities and crypto down, cash built up for the rental deposit.
  ["2022-06-01", { real_estate: 150000, etf: 18500, stocks: 0,     crypto: 1800, pension: 9000,  cash: 40000 }],
  // Bought the Rotterdam rental — cash converts into rental equity.
  ["2022-09-01", { real_estate: 200000, etf: 18000, stocks: 0,     crypto: 1900, pension: 9500,  cash: 8000  }],
  // Housing correction + market trough — a mild dip before the recovery; first
  // individual stock (NVIDIA) as the AI rally began.
  ["2023-03-01", { real_estate: 186000, etf: 20000, stocks: 2500,  crypto: 2600, pension: 11000, cash: 10000 }],
  ["2023-12-01", { real_estate: 196000, etf: 23000, stocks: 6500,  crypto: 3600, pension: 14000, cash: 13000 }],
  // Diversifying the liquid sleeve through 2024: Ethereum, Microsoft, Micron added
  // alongside the index core; markets at highs.
  ["2024-09-01", { real_estate: 222000, etf: 28000, stocks: 22000, crypto: 7500, pension: 20000, cash: 18000 }],
  ["2025-06-01", { real_estate: 240000, etf: 31000, stocks: 30000, crypto: 9500, pension: 27000, cash: 22000 }],
  // Newest anchor: liquid sleeve (etf+stocks+crypto = €90.7k) marked ≈ the live
  // valuation of the seeded units (audit 2026-06), so the live tip continues the
  // curve instead of stepping. Total ≈ €400.7k — matching what the hero shows.
  ["2026-06-01", { real_estate: 250000, etf: 36000, stocks: 42000, crypto: 12700, pension: 34000, cash: 26000 }],
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
  for (const table of DEMO_USER_TABLES) {
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
    beforeUnits: number | null,
    afterUnits: number | null,
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

  // A position the persona bought and later fully EXITED. It is not in the current
  // holdings, so its symbol / type / currency are passed explicitly here (the
  // byName lookup only covers still-held assets). Returns the buy and the sell as a
  // pair; the "remove" is what the Decision Verdict scores. Real tickers + real past
  // sell dates, so the verdict is computed against genuine historical prices — the
  // values below are only the journal's cosmetic impact figures, never the verdict.
  const exitedTrade = (opts: {
    name: string; symbol: string; assetType: string; currency: string;
    buyDate: string; buyValue: number; units: number; buyNote: string; buyTotal: number; buyMarket?: string;
    sellDate: string; sellValue: number; sellNote: string; sellTotal: number; sellMarket?: string;
  }): Array<Record<string, unknown>> => {
    const common = (occurredAt: string) => ({
      user_id: userId,
      asset_id: null,
      asset_name: opts.name,
      asset_type: opts.assetType,
      symbol: opts.symbol,
      currency: opts.currency,
      occurred_at: occurredAt,
      recorded_at: `${occurredAt}T12:00:00Z`,
    });
    return [
      {
        ...common(opts.buyDate),
        action: "add",
        before_value: null, after_value: opts.buyValue,
        before_units: null, after_units: opts.units,
        personal_context: opts.buyNote,
        market_context: opts.buyMarket ?? null,
        portfolio_total: opts.buyTotal,
      },
      {
        ...common(opts.sellDate),
        action: "remove",
        before_value: opts.sellValue, after_value: null,
        before_units: opts.units, after_units: null,
        personal_context: opts.sellNote,
        market_context: opts.sellMarket ?? null,
        portfolio_total: opts.sellTotal,
      },
    ];
  };

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
      3300,
      20,
      "Added a core Apple position. Boring in the best way: a cash machine with a sticky ecosystem and relentless buybacks.",
      245000,
    ),
    add(
      "Ethereum",
      "2024-01-18",
      2640,
      1.1,
      "Added Ethereum alongside Bitcoin — I wanted exposure to the smart-contract side of crypto, still sized small on purpose.",
      262000,
    ),
    add(
      "Microsoft",
      "2024-02-22",
      3330,
      9,
      "Bought Microsoft for the cloud and Copilot story. Enterprise AI revenue that actually shows up in the numbers, not just the headlines.",
      266000,
    ),
    add(
      "SpaceX",
      "2024-05-15",
      3220,
      20,
      "Bought 20 shares of SpaceX on its first day of trading. A speculative slice I am happy to leave untouched for years.",
      280000,
      "SpaceX listed publicly for the first time; I took a small position on day one of the IPO.",
    ),
    add(
      "Micron Technology",
      "2024-07-15",
      2700,
      30,
      "Bought Micron as the memory play on the AI build-out — the picks and shovels behind the GPUs, at a far cheaper multiple.",
      292000,
    ),
    topUp(
      "Bitcoin",
      "2024-10-08",
      3000,
      4900,
      0.05,
      0.07,
      "Added a little more Bitcoin on a quiet stretch. Still capped near a few percent of liquid assets, still boring on purpose.",
      305000,
    ),
    topUp(
      "Apple",
      "2025-05-20",
      4200,
      3360,
      20,
      16,
      "Trimmed Apple back after a strong run, taking a little off the top to rebalance. Not a change of view, just keeping any one name from getting too big.",
      338000,
    ),
    topUp(
      "Apartment — Amsterdam",
      "2025-08-12",
      165000,
      190000,
      null,
      null,
      "Made a one-off overpayment of 25,000 euro on the home mortgage. A guaranteed 1.9 percent saved beat leaving the cash idle, and it brings the payoff date closer.",
      345000,
    ),
    topUp(
      "iShares Core MSCI World",
      "2025-10-14",
      19000,
      30000,
      200,
      320,
      "Kept the monthly index plan running and topped up again. The most reliable thing I do is buy a little every month and ignore the noise.",
      352000,
    ),
    topUp(
      "NVIDIA",
      "2026-02-18",
      3600,
      4800,
      30,
      40,
      "Added a little more NVIDIA. Letting a winner run, but only inside a sleeve I have sized to sleep through.",
      362000,
    ),


    // ── Recent activity, dated relative to the reseed moment ─────────────────
    // Keeps the Diary's 1W/1M/3M ranges populated and fills the gap after the
    // fixed-date history above. Routine, reasoning-first journal entries: a
    // steady monthly index plan, regular pension contributions, a small active
    // tech sleeve and one Bitcoin nibble — portfolio_total trends ~363k → ~378k
    // in date order. No market_context: these are ordinary contributions, not
    // entries tied to a genuine market event.
    topUp(
      "iShares Core MSCI World",
      daysAgo(120),
      30000, 30380, 320, 324,
      "Kept the monthly index plan running and topped up the world tracker again. The most reliable thing I do is buy a little every month and ignore the noise.",
      363000,
    ),
    topUp(
      "Brand New Day DC pension",
      daysAgo(113),
      32600, 32900, null, null,
      "Logged this month's workplace pension contribution. Locked until 67, but it compounds quietly in the background.",
      363600,
    ),
    topUp(
      "Micron Technology",
      daysAgo(106),
      2700, 3060, 30, 34,
      "Added to Micron as the memory cycle kept turning. Still the cheapest way I have found to own the AI build-out.",
      364200,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(99),
      30380, 30760, 324, 328,
      "Another automatic top-up into the MSCI World core. I would rather be consistent than clever.",
      364800,
    ),
    topUp(
      "Microsoft",
      daysAgo(92),
      3330, 3700, 9, 10,
      "Added to Microsoft. The cloud and Copilot story keeps showing up in the actual revenue, not just the slides.",
      365400,
    ),
    topUp(
      "Bitcoin",
      daysAgo(85),
      4900, 5170, 0.07, 0.073,
      "Made a small Bitcoin nibble on a quiet stretch. Still capped near a few percent of liquid assets, still boring on purpose.",
      365800,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(78),
      30760, 31140, 328, 332,
      "Topped up the global index again. No view on the month ahead, just the same steady buying.",
      366400,
    ),
    topUp(
      "Brand New Day DC pension",
      daysAgo(71),
      32900, 33200, null, null,
      "Another monthly pension contribution went in. Out of sight, but real capital adding up.",
      366900,
    ),
    topUp(
      "Apple",
      daysAgo(64),
      3360, 2960, 16, 14,
      "Trimmed Apple again after another strong stretch, taking a little off the top to keep any one name in check. Not a change of view, just discipline.",
      367200,
    ),
    topUp(
      "NVIDIA",
      daysAgo(58),
      4800, 5350, 40, 44,
      "Added a little more NVIDIA. Still the clearest infrastructure play on AI compute, still kept within its cap.",
      368000,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(52),
      31140, 31520, 332, 336,
      "Routine monthly purchase into the world tracker. The whole point is that it requires no decision.",
      368600,
    ),
    topUp(
      "Micron Technology",
      daysAgo(46),
      3060, 3400, 34, 37,
      "Topped up Micron again. The picks-and-shovels thesis behind the GPUs is playing out as I hoped.",
      369200,
    ),
    topUp(
      "Brand New Day DC pension",
      daysAgo(40),
      33200, 33500, null, null,
      "Recorded the regular pension contribution. The employer match makes this the easiest return I get.",
      369700,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(35),
      31520, 31900, 336, 340,
      "Added to the index core on schedule. Time in the market over timing it.",
      370300,
    ),
    topUp(
      "Microsoft",
      daysAgo(28),
      3700, 4070, 10, 11,
      "Topped up Microsoft again. Enterprise AI is turning into real money, so I am happy to keep accumulating.",
      371000,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(24),
      31900, 32280, 340, 344,
      "Monthly index contribution went in. I keep the core boring so the rest of the portfolio can be interesting.",
      371600,
    ),
    topUp(
      "Micron Technology",
      daysAgo(20),
      3400, 3740, 37, 40,
      "Bought a little more Micron on weakness. Adding to conviction when the price cooperates.",
      372200,
    ),
    topUp(
      "Brand New Day DC pension",
      daysAgo(16),
      33500, 33800, null, null,
      "Monthly pension contribution logged. Boring, automatic, and exactly how retirement saving should feel.",
      372700,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(12),
      32280, 32660, 344, 348,
      "Topped up the MSCI World tracker again. Steady accumulation is the entire strategy.",
      373400,
    ),
    topUp(
      "Bitcoin",
      daysAgo(9),
      5170, 5360, 0.073, 0.075,
      "Added a touch more Bitcoin. Tiny, deliberate, and sized so a drawdown can never hurt.",
      373800,
    ),
    topUp(
      "Apple",
      daysAgo(7),
      2960, 3320, 14, 16,
      "Added back to Apple after the recent pullback. A cash machine with a sticky ecosystem, and I am happy to own a little more at a better price.",
      374600,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(5),
      32660, 33140, 348, 353,
      "Kept the index plan going with another top-up. Consistency is the only edge I trust.",
      375400,
    ),
    topUp(
      "NVIDIA",
      daysAgo(4),
      5350, 5640, 44, 46,
      "Topped up NVIDIA once more. Letting the position compound, still inside the cap I set for it.",
      376200,
    ),
    topUp(
      "Brand New Day DC pension",
      daysAgo(3),
      33800, 34100, null, null,
      "Logged the regular workplace pension top-up. The match is free money, so this one is never up for debate.",
      377000,
    ),
    topUp(
      "iShares Core MSCI World",
      daysAgo(1),
      33140, 33640, 353, 358,
      "Latest top-up of the cycle into the world tracker. Same plan, same discipline.",
      378000,
    ),

    // ── Positions bought and later fully exited ──────────────────────────────
    // The persona did not only accumulate — these are the sells. Each is a real
    // ticker exited on a real past date, so the Decision Verdict on the "Removed
    // …" entry scores against genuine price history (some calls aged well, some
    // did not — exactly the honest mix the feature is meant to surface).
    ...exitedTrade({
      name: "Intel", symbol: "INTC", assetType: "stocks", currency: "USD",
      buyDate: "2022-06-10", buyValue: 3040, units: 80,
      buyNote: "Bought Intel as a turnaround and foundry bet — cheap, paid a dividend, and a credible plan to make chips for the whole industry.",
      buyTotal: 201000,
      sellDate: "2024-04-12", sellValue: 3520,
      sellNote: "Sold Intel and took the small loss. The foundry turnaround kept slipping and the dividend was at risk — the case I bought had quietly fallen apart, so I admitted it rather than average down.",
      sellTotal: 272000,
    }),
    ...exitedTrade({
      name: "Tesla", symbol: "TSLA", assetType: "stocks", currency: "USD",
      buyDate: "2022-11-18", buyValue: 2700, units: 15,
      buyNote: "Bought Tesla on the post-peak slide — a bet on the energy business and FSD optionality more than the cars themselves.",
      buyTotal: 216000,
      buyMarket: "Tesla had fallen hard from its 2021 peak; I bought into the weakness.",
      sellDate: "2024-09-16", sellValue: 3450,
      sellNote: "Sold Tesla to cut single-name risk. Too much of the thesis rode on headlines and one person rather than the numbers, and the position had drifted larger than I was comfortable with.",
      sellTotal: 301000,
    }),
    ...exitedTrade({
      name: "PayPal", symbol: "PYPL", assetType: "stocks", currency: "USD",
      buyDate: "2021-08-05", buyValue: 6875, units: 25,
      buyNote: "Bought PayPal as a core fintech compounder — digital payments still taking share from cash, with a real moat in checkout.",
      buyTotal: 158000,
      sellDate: "2023-03-10", sellValue: 1800,
      sellNote: "Sold PayPal and admitted the mistake. Growth slowed, competition caught up, and the story I paid a premium for at 275 simply was not there anymore.",
      sellTotal: 232000,
      sellMarket: "Sold during the regional-bank scare around the collapse of Silicon Valley Bank.",
    }),
    ...exitedTrade({
      name: "Adyen", symbol: "ADYEN.AS", assetType: "stocks", currency: "EUR",
      buyDate: "2021-10-12", buyValue: 17600, units: 8,
      buyNote: "Bought a few shares of Adyen — a rare European payments champion compounding at high margins, and close to home.",
      buyTotal: 167000,
      sellDate: "2023-08-20", sellValue: 7200,
      sellNote: "Sold Adyen into the summer collapse after a brutal earnings miss. In hindsight this was fear, not analysis — I sold the panic instead of sitting with a business I still believed in.",
      sellTotal: 240000,
      sellMarket: "Adyen had just fallen roughly forty percent in a single session on a margin and growth miss.",
    }),
  ];

  const { error: mutationError } = await supabase.from("mutations").insert(mutationRows);
  if (mutationError) throw mutationError;

  const { error: snapshotError } = await supabase.from("snapshots").insert(snapshotRows(userId));
  if (snapshotError) throw snapshotError;

  // Market highlights are normally written by the daily 07:00 cron, so a
  // freshly reseeded demo account would show an empty market section until the
  // next run — bad for App Review. Seed deterministic, evergreen items tied to
  // the demo holdings instead. Given a 7-day horizon (not the cron's usual 24h)
  // so the demo's Markets block — now at the top of the Vitals page — stays
  // populated through a long exploration session rather than lapsing after a day;
  // every /demo entry re-creates them regardless.
  const marketExpiry = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const marketSeeds = [
    {
      title: "NVIDIA steady after earnings",
      detail: serializeMarketDetail({
        detail: "NVIDIA held its level this week as AI-chip demand stayed firm. Your 40 shares moved with the sector, not against it.",
        impact_eur: 280,
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
      fingerprint: "Amsterdam homeowner with a Rotterdam rental, a global-index core, and a sleeve of high-conviction tech and crypto bets.",
      profile: {
        life_and_direction:
          "Early forties in Amsterdam, owns the family apartment and a small Rotterdam rental, and wants the next decade to compound quietly.",
        approach:
          "Index-first: a global MSCI World core, a high-conviction tech sleeve, and a small crypto position, with property held long-term and conservatively levered.",
        currently_exploring:
          "Whether to keep overpaying the 1.9% home mortgage after last year's lump sum, or route the spare cash into the index instead.",
        worth_raising:
          "The Rotterdam mortgage is interest-only and still needs a repayment plan, and the tech sleeve has grown larger than originally intended.",
      },
    })
    .eq("id", userId);
}
