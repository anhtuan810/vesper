# Demo Portfolio net-worth chart — "fake cliff" on 1M (read-only audit)

**Date:** 2026-06-23
**Scope:** Read-only diagnosis. No runtime code, seed data, or demo data was modified. Fix is recommended, not implemented.

## Symptoms

1. On the **1M** range the net-worth chart reads as a flat line over the seeded
   history and then a single **vertical step up** to the live value — a "cliff" at
   the right edge rather than a smooth continuation.
2. The live net worth shown by the hero / chart tip (**~€400,690**) is materially
   higher than the most recent seeded history point (the 2026-06-01 anchor,
   **€367,800 ≈ €368k**).

## TL;DR root cause

The demo seeds a **fixed, hand-authored EUR history** whose newest point
(`2026-06-01 = €367,800`) is **~€33k below** the **live mark-to-market** the chart
synthesizes for the "today" tip (**€400,690**). The history line and the tip are
produced by two *different* valuation paths that were assumed to agree but don't:

- **History** = fixed category sums in `SNAPSHOT_ANCHORS` (EUR, frozen).
- **Tip** = the live asset set valued at **live market prices × units**, FX-converted
  to EUR (`netTotal`).

The entire €32,890 gap sits in the **liquid sleeve** (ETF + stocks + crypto):
the tip marks it to **€90,690**, the seed's 2026-06-01 anchor assigns it **€57,800**.
With the y-axis anchored at 0, the seeded months render as a flat line and the lone
live tip draws as a vertical step. This is a **seed-vs-live mismatch**, not a chart
bug. The file header's premise that "the only USD/live-priced holdings (NVIDIA,
Apple) are a tiny sleeve, so today's live tip is a smooth continuation of the seeded
history, never a cliff" (`src/lib/demo-seed.ts:12-14`) is **false** for the current
holdings — the live-priced sleeve is large and marks well above its seeded value.

---

## Answers to the audit questions

### 1. Live demo snapshots (throwaway read-only SELECT) — **SKIPPED (no creds)**

The query could not be run: this environment has **no** `NEXT_PUBLIC_SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`, `DEMO_USER_ID`, or `DEMO_USER_EMAIL` set (only
`.env.example` is present; there is no real `.env`). Per the task instruction, this
step is skipped and called out explicitly. Everything below is derived from the
code and is deterministic; the one item that *would* benefit from the live read is
the literal value of `series[0]` (see Q3).

The intended read-only check (for whoever has creds) would be:

```sql
-- service-role; SELECT only
select count(*), min(date), max(date) from snapshots where user_id = :demo;
select date, total_value, native_breakdown from snapshots
  where user_id = :demo order by date desc limit 5;
select date, total_value, native_breakdown from snapshots
  where user_id = :demo and date <= (current_date - 30) order by date desc limit 1;
```

Expected, if the reseed ran cleanly: `count = 66`, `min = 2021-01-01`,
`max = 2026-06-01`, newest rows ≈ €366k–€368k, the "~30 days ago" row = `2026-05-01`
≈ €365,566.

### 2. Does the reseed leave ONLY the monthly seed rows? Is max date today / 2026-06-01 / older?

**A clean reseed leaves ONLY the 66 monthly seed rows; max snapshot date = `2026-06-01` (NOT today).**

- `seedDemoUser` deletes `snapshots` with `.delete().eq("user_id", userId)` and
  `if (error) throw error` (`src/lib/demo-seed.ts:310-316`). It uses the
  **service-role** client (`createServerSupabase`, bypasses RLS) with a correct
  filter, so a **successful** delete removes *all* of the user's snapshot rows.
- The subsequent insert (`src/lib/demo-seed.ts:742`) writes exactly
  `snapshotRows(userId)` — monthly points from `2021-01-01` to `2026-06-01`
  (loop bound `end = 2026-06-01`, `src/lib/demo-seed.ts:257-289`). That is **66 rows**.
- There is **no code path** that leaves stale cron rows behind after a *successful*
  reseed: any delete error throws and aborts the whole seed (the demo route then
  falls back to `/login`, `src/app/demo/route.ts:55-59`), and the insert is
  all-or-nothing (also throws). So the comment's "stale cron-written rows survive →
  bogus cliff" scenario (`src/lib/demo-seed.ts:305-309`) only materializes if a
  delete *silently no-ops*, for which there is no observed mechanism here.
- The daily cron (`src/app/api/cron/snapshot/route.ts`) calls `writeSnapshot` for
  every user with assets, **including** the demo user, and would add a `today` row
  at the live total. But (a) the next `/demo` entry wipes it, and (b) `buildSeries`
  **discards** any raw row dated today and substitutes its own tip
  (`src/components/NetWorthChart.tsx:230-233`), so a cron `today` row neither
  survives nor changes the picture.

> Caveat: this conclusion is from code. The live SELECT in Q1 is the only way to
> *prove* the demo user's table currently holds exactly the 66 seed rows and nothing
> pre-dating the current seed logic.

### 3. For range=1M, what does `clipToRange` pick as `series[0]`?

`clipToRange(full, "1M")` (`src/components/PortfolioTab.tsx:40-50`) computes
`windowStart = today − 30d = 2026-05-24`, keeps every row `< windowStart` only as a
rolling **anchor** (the last one wins), and pushes rows `>= windowStart` into the
window.

With clean seed data the monthly rows straddling the window are `2026-05-01` and
`2026-06-01`:

- `2026-05-01` (€365,566) `< 2026-05-24` → becomes the **anchor = series[0]**.
- `2026-06-01` (€367,800) `>= 2026-05-24` → the only in-window row.
- `buildSeries` appends the live tip (`today`, `total_value = netTotal ≈ €400,690`).

So in the happy path **`series[0]` = the ~€366k `2026-05-01` row** (i.e. the chart
is `[€365.6k, €367.8k, €400.7k]`), **not** a near-zero row.

Why it still *looks* like "a flat line then a spike": `computeYAxisDomain` anchors
the floor at **0** for non-negative net worth (`src/lib/networth-axis.ts:70-77`), so
the y-domain is ~`[0, €432k]`. The two seed points sit at ~85% height and differ by
only ~€2k (invisible at that scale → a flat line); the tip sits at ~93% → the
final segment is the "cliff." X positions are **index-spaced**
(`x = i/(n-1)`, `src/components/NetWorthChart.tsx:134`), so the €33k jump is drawn
across the last *half* of the chart regardless of the 22-day calendar gap, which
exaggerates the verticality.

A literally **near-zero** `series[0]` would require a stale/foreign row predating
the seed surviving as the anchor — which the Q2 code analysis says should not
happen on a clean reseed. **This is the one claim that needs the Q1 live SELECT to
settle.** Either way the *cliff at the right edge is real and present even with
perfectly clean data*, so the fix below stands independently.

### 4. Quantify the tip-vs-last-snapshot gap and identify the ~€33k source

| Component (EUR)        | Live tip (`netTotal`) | Seed 2026-06-01 anchor |
|------------------------|----------------------:|-----------------------:|
| Property (equity)      |               250,000 |                250,000 |
| Cash                   |                26,000 |                 26,000 |
| Pension                |                34,000 |                 34,000 |
| **Deterministic subtotal** |          **310,000** |            **310,000** |
| ETF + stocks + crypto  |            **90,690** |             **57,800** |
| **Total**              |          **~400,690** |            **367,800** |

**Gap = €400,690 − €367,800 = €32,890 ≈ €33k, and it is *entirely* in the liquid
sleeve (€90,690 − €57,800 = €32,890).**

Attribution:

- **It is "a holding above its seed."** The tip values tradeables as
  `livePrice × units` in the price's native currency (`applyLivePrice`,
  `src/lib/live-pricing.ts:18-34`; consumed by `netTotal`,
  `src/app/(main)/page.tsx:138-145`). The seeded units (NVDA 40, MSFT 9, MU 30,
  AAPL 16, IWDA 320, BTC 0.07, ETH 1.1) marked to current market exceed both the
  stored `value` fields and the anchor's fixed `stocks: 18800 / etf: 30000 /
  crypto: 9000`. The dominant contributor is the **US tech sleeve** (NVIDIA in
  particular — the seed narrative literally "lets the winner run" to 40 units),
  plus the IWDA core and BTC.
- **NOT property / CBS.** Property equity is deterministic **€250,000** in *both*
  paths: the live tip uses `value − computeCurrentBalance`, and the mortgage
  balances are recorded `as of today` so there is no drift
  (`src/lib/demo-seed.ts:64-66, 89`; `src/app/(main)/page.tsx:140-142`). CBS
  revaluation only shapes the *backfilled* historical curve, never the tip.
- **NOT FX (FX is a small offset in the *opposite* direction).** The anchor treats
  the stocks bucket as if it were €18,800; the tip converts the USD names USD→EUR,
  which *reduces* their EUR value (~€1.4k at EUR/USD≈1.08). FX therefore shrinks the
  gap slightly; the live price appreciation more than overcomes it.

### 5. Units: is the display path EUR-native everywhere (no USD distortion)?

**Yes — the display path is correct; `total_value` is never treated as USD in a way
that distorts the demo curve.**

- The seed writes `total_value` = the EUR total and `native_breakdown = { EUR: total }`
  (`src/lib/demo-seed.ts:280-286`). The schema's "USD" label on `total_value` is
  irrelevant to the demo because conversion goes through `native_breakdown`.
- `convertPointToDisplay` (`src/components/NetWorthChart.tsx:65-86`) prefers
  `native_breakdown`: for each currency it calls `convertCurrency(amt, cur, display,
  rates)`, and **EUR→EUR is a short-circuit identity** (`src/lib/currency-convert.ts:10`).
  So every seeded row renders at its stored EUR value — no FX, no drift.
- The `total_value`-as-USD fallback (`src/components/NetWorthChart.tsx:84-85`) only
  fires when `native_breakdown` is absent/empty — which is **not** the case for seed
  rows. The live tip (`date === today`) is returned unchanged because `netTotal` is
  already in display currency (`src/components/NetWorthChart.tsx:70-71`).

So units are *not* the cause. (Confirming this matters: if the seed rows were ever
read as USD they'd shrink ~7%, which would *deepen* the apparent cliff — but they
aren't.)

---

## Root cause & responsible lines

**Root cause:** the demo's most-recent fixed history anchor under-values the live,
market-priced holdings by ~€33k, so the synthesized live "today" tip steps up from
the last seeded month instead of continuing it. Two valuation paths that were
assumed equal are not.

Exact responsible lines:

- `src/lib/demo-seed.ts:248` — the newest anchor
  `["2026-06-01", { real_estate: 250000, etf: 30000, stocks: 18800, crypto: 9000,
  pension: 34000, cash: 26000 }]`. The **`etf` (30000) + `stocks` (18800) +
  `crypto` (9000) = 57,800** liquid sum is the under-count; the live tip marks the
  same holdings to **~90,690**.
- `src/lib/demo-seed.ts:227-249` + `:253-292` — `SNAPSHOT_ANCHORS` / `snapshotRows`
  author the history as fixed EUR sums **independently** of the live valuation of
  `assetSeeds()`, and the loop **ends at `2026-06-01`** (`:257-258`), so there is no
  history point near "today" to absorb the live delta.
- `src/lib/demo-seed.ts:12-14` — the header's incorrect premise ("tiny live sleeve →
  smooth continuation"); the sleeve is not tiny.
- Tip synthesis (correct behavior, but where the mismatch surfaces):
  `src/app/(main)/page.tsx:138-145` (`netTotal` from live values) →
  `src/components/PortfolioTab.tsx:146` (passes `netTotal`) →
  `src/components/NetWorthChart.tsx:229-233` (`buildSeries` appends the tip).

## Minimal fix recommendation (do NOT implement)

Make the **newest seeded history reflect the same valuation the tip uses**, so the
final segment is a continuation, not a step. In order of preference:

1. **Targeted (smallest change):** raise the recent `SNAPSHOT_ANCHORS` liquid sums
   so the `2026-06-01` anchor's `etf + stocks + crypto` ≈ the live mark-to-market of
   the seeded units (~€90.7k vs the current €57.8k), and nudge the trailing
   `daysAgo(...)`-dated narrative so the last ~30 days trend into that level. This
   shrinks the cliff to noise while keeping the "fixed history, live tip" design.
   *Limitation:* live prices drift, so the match is approximate — but going from a
   ~57% under-count to within a few percent removes the visible cliff.
2. **Durable:** derive the seed's recent tail from one valuation path — e.g. value
   the seeded units at a fixed reference price that the tip will also land near, or
   reconcile each tradeable's stored `value` (`assetSeeds()`) with `units × a
   plausible current price` so `livePrice × units ≈ value ≈ anchor`. This stops the
   two paths from drifting structurally.
3. **Alternative:** restore the header's premise by **shrinking the live-priced
   sleeve** (fewer units on the volatile US names) so the tip naturally lands near
   the fixed anchor. This changes the persona's composition, so it is the least
   attractive.

Separately, if the live Q1 SELECT shows `series[0]` is actually a near-zero
*pre-seed* row (i.e. stale rows did survive), harden `seedDemoUser`'s snapshot
delete with a post-delete count assertion so a silent no-op can't leave leftover
history under the fresh seed — but the code analysis indicates the cliff is the
seed-vs-tip mismatch above, which exists regardless.

---

## Resolution (2026-07-02) — shipped

Fixed on `main` during the UI-overhaul session, combining recommendation 1 with
two write-side protections the investigation surfaced:

1. **Anchors reconciled** (`5272dc5`): the trailing `SNAPSHOT_ANCHORS` liquid
   sums were raised so the newest anchor's `etf + stocks + crypto` ≈ the live
   mark-to-market of the seeded units (2026-06: etf 36000 / stocks 42000 /
   crypto 12700 → liquid ≈ €90.7k, total ≈ €400.7k). The seed header now
   carries the INVARIANT: *the newest anchor must approximate the live mark of
   the seeded units* — re-reconcile when units or the narrative change.
2. **Demo rebuild guard** (`784160e`): `backfillSnapshots` returns early for
   demo accounts (entitlements `product_id = 'demo'`), so a visitor's chat edit
   can never replace the authored curve with a mutation-timeline reconstruction.
3. **Price fall-forward** (`784160e`): reconstruction valuation falls forward
   to the first candle (`priceAtOrBefore(...) ?? history[0]`), so dates before
   a symbol's first close can no longer zero a row.
4. **Time-true x-axis** (`5272dc5`): index-spaced plotting had been visually
   amplifying the cliff (sparse early rows stretched, dense recent rows
   compressed); points now sit at their true time positions.
