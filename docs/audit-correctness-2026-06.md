# Correctness Audit — Reactivity, Snapshots, Mortgage, Vitals, Chat

Read-only audit. No application code, config, schema, or styles were modified.
Date: 2026-06-03. Scope: how the app computes/refreshes derived state, handles
mortgages, computes Vitals, and extracts data from chat.

Citations are `path:line` ranges against the tree at audit time. Each finding
states **Current behavior** and **Notes/divergence** from the symptom hypotheses.

---

## Stack facts

- **Framework**: Next.js `^16.2.4`, React `^19.2.5` (`package.json:24-26`). **App
  Router** (`src/app/**`, route groups `(main)`, `route.ts` handlers, `layout.tsx`).
  No `pages/` dir.
- **Client data fetching/caching**: **No React Query / SWR.** Hand-rolled hooks
  using `fetch` + `useState/useEffect`, plus `sessionStorage` and module-level
  singletons as caches:
  - `useAssets` (`src/lib/hooks/assets.ts:90-228`): client Supabase reads + `/api/prices`,
    `sessionStorage` cache (`assetsCacheKey`), polling interval.
  - `useVitals` (`src/lib/hooks/vitals.ts:17-49`): module-level `_vitalsCache` with
    **1-hour TTL**, `fetch("/api/vitals", {cache:"no-store"})`.
  - `useProfile` (`src/lib/hooks/user.ts:27-42`): single fetch on mount, no invalidation.
  - Server routes set HTTP `Cache-Control` (e.g. `/api/vitals` `max-age=3600`,
    `/api/snapshots` `max-age=300`, `/api/dashboard-init` `max-age=30`).
  - **No `revalidatePath` / `revalidateTag` / server actions** anywhere
    (grep for `revalidate` only matches `stale-while-revalidate` cache headers).
- **Supabase access**: `src/lib/supabase.ts`.
  - Browser: `createBrowserSupabase()` (anon key, PKCE) — `:18-24`.
  - Server API routes: `createServerSupabase()` uses **service-role key**
    (`SUPABASE_SERVICE_ROLE_KEY`) — `:27-33`. Auth verified per-request from cookies
    via `getAuthUser()` (`:7-15`).
- **LLM**: `@anthropic-ai/sdk ^0.92.0`. Chat uses `claude-sonnet-4-6`
  (`src/app/api/chat/route.ts:632`); pulse & profile extraction use
  `claude-haiku-4-5-20251001` (`src/lib/pulse-generator.ts:70`,
  `src/lib/profile-extractor.ts:36`).
- **Migrations in repo** (`supabase/migrations/`): only incremental ALTERs / two new
  tables (`rate_limits`, `scenarios`) + index/constraint tweaks. **The core tables
  (`assets`, `mutations`, `snapshots`, `vital_snapshots`, `highlights`, `users`,
  `goals`, `messages`) have NO `CREATE TABLE` in the repo** — their schema lives only
  in the live Supabase project. Columns below are inferred from query/insert sites.
- **Cron**: `vercel.json` defines two crons — `/api/cron/snapshot` daily `0 0 * * *`
  and `/api/cron/market-highlights` daily `0 7 * * *`.

---

## CLUSTER 1: Data fetching & reactivity

### 1.1 The write path (chat "save" flow)

`src/app/api/chat/route.ts:467-1121` (POST). Live path is the **tag-emission flow**
(the agent tool-loop at `:561-575` is flag-gated OFF by default — `CHAT_AGENT_LOOP`,
`src/lib/chat/agent-config.ts:5-8`). Claude emits `<changes>`; the route parses
(`:658-666`), validates (`:867`), geocodes addresses (`:878-911`), then calls
`applyPortfolioChanges` (`src/lib/apply-changes.ts:81-535`) which writes `assets` +
`mutations` rows.

**Current behavior — post-write invalidation (all via `after()`, i.e. background):**
- `:1030-1038` deletes the cached **pulse** highlight (`type="pulse"`).
- `:1044-1063` deletes the cached **insight** highlight and regenerates+caches a new one.
- `:1087-1093` `writeSnapshot(userId)`; `:1095-1102` `backfillSnapshots` when `needsBackfill`.
- `:932-934` (after) backfills `market_context` onto mutation rows.
- The HTTP response returns `assets: updatedAssets` (`:1106-1112`) — the freshly
  re-read asset rows (`:976-982`).

```ts
// route.ts:1030
if (portfolioChanged) { after(async () => {
  await supabaseAfter.from("highlights").delete().eq("user_id", userId).eq("type", "pulse");
```

**Notes/divergence:** There is **no cross-surface revalidation**. Only the surface
that *initiated* the chat updates: on the Portfolio page, `ChatPopup.onPortfolioUpdate`
calls `refetchAssets()` + `refreshMutations()` (`src/app/(main)/page.tsx:244-248`).
The **Vitals, Profile, and Diary routes are independent** and hold their own caches:
- Vitals: server `after()` deletes the pulse row, but the **client `useVitals` cache
  has a 1-hour TTL** (`hooks/vitals.ts:25-32`) AND the route response is
  `Cache-Control max-age=3600` (`api/vitals/route.ts:123`). So a fresh `/api/vitals`
  call (which would regenerate the pulse) is suppressed for up to an hour ⇒ "Pulse
  still says no property yet."
- Profile "Context": stored prose in `users.profile`; only changes when
  `extractProfileUpdate` runs (LLM), never recomputed ⇒ stale mortgage balance persists.
- Diary: fetches on mount only (see 1.4) ⇒ needs manual refresh.

### 1.2 Where each surface's data is computed / cached

| Surface | Computed | Cached / recomputed |
|---|---|---|
| (a) Holdings + net worth | **Client, on read** — `useAssets` live-prices, net worth summed in `page.tsx:84-95` (real estate as **equity** `value − computeCurrentBalance`). | `sessionStorage` asset cache; live prices polled. Recomputed each render. |
| (b) Vitals values | **Server, on read** — `computeAllVitals` in `api/vitals/route.ts:30`. | Pure recompute per request, but gated by `useVitals` 1h cache + 1h HTTP cache. Also persisted daily to `vital_snapshots` by cron (`vitals/persist.ts`). |
| (c) Pulse sentence | **Server** — `generatePulse` (Haiku) in `api/vitals/route.ts:64-103`. | **Stored** in `highlights` (`type="pulse"`, 24h+jitter expiry, `PULSE_VER="v2:"` guard) `:45-86`. Regenerated on cache miss/expiry or after the route's pulse-delete on mutation. |
| (d) Profile "Perspective" | **Client, deterministic** — `computePerspective(netWorthEur,…)` (`ProfileContent.tsx:93-96`, `vitals/perspective.ts:58-110`). | Recomputed from live `useNetWorth`. Not LLM. |
| (d) Profile "Context" (Life and direction / Approach / Currently exploring / Worth raising) | **Server LLM** — `extractProfileUpdate` (Haiku) writes `users.profile` (`profile-extractor.ts:35-148`). | **Stored prose**, append-only merge (`:119-138`). `useProfile` reads once per mount. Never recomputed from current numbers. |
| (e) Diary list | **Client** — direct Supabase read in diary page (`diary/page.tsx:26-41`). | Fetched on mount; paginated; no realtime. |

### 1.3 Is the Pulse / Profile Context cron-generated or on-demand?

- **Pulse**: generated **on demand** at `/api/vitals` request time and **stored** in
  `highlights` for ~24h (`api/vitals/route.ts:64-96`). Regenerated when: the cache row
  is missing/expired/version-mismatched, OR the chat route deleted it after a mutation
  (`route.ts:1030-1038`). The daily cron writes `vital_snapshots` numbers
  (`vitals/persist.ts`) but **does not write the pulse**. A second non-persisted
  "liquid-lens" pulse is generated per request for mixed portfolios
  (`api/vitals/route.ts:100-103`).
- **Profile Context text**: generated **on demand during chat** by `extractProfileUpdate`
  (`route.ts:1019-1025`, `:1067-1085`), stored in `users.profile`. No cron. Regenerated
  only on qualifying chat turns; merges/append, never overwrites stale numbers.

### 1.4 Header sync/refresh control & green dot

`src/components/NavBar.tsx:105-152`. The refresh button calls `refreshPrices`
(= `useAssets.fetchPrices`, `hooks/assets.ts:130-191`).

**Current behavior:** It re-fetches **live prices only** from `/api/prices` for the
current page's assets and (if Yahoo currency/symbol drifted) patches those asset rows.
It is **not** a global cross-tab sync — it lives in `useAssets`, instantiated per page;
the Vitals/Profile caches are untouched. `lastUpdated` is the price-fetch timestamp.

The **green dot** (`NavBar.tsx:131-151`) reflects **price liveness**, not data freshness:
- green/`--positive` = all symbols live and price age < `PRICE_CACHE_TTL_MS`,
- accent = partial,
- faint = prices unavailable.

**On the Diary page** the NavBar is passed `refreshPrices={() => {}}` and
`liveCount=0,totalSymbols=0` (`diary/page.tsx:120-123`) — so **the header refresh is a
no-op on Diary** and the dot is always faint. The Diary's own data loads via
`fetchMutations` on mount (`diary/page.tsx:26-41,59`); the only programmatic refresh is
the once-per-session `/api/backfill` call that re-fetches if rows were updated
(`:62-70`). There is no realtime subscription ⇒ a mutation made elsewhere requires a
manual page reload/navigation.

---

## CLUSTER 2: Snapshots & baseline

### 2.1 Snapshots table, writers, cron

- **Schema** (inferred — no `CREATE TABLE` in repo): `snapshots(user_id uuid, date date,
  total_value numeric, breakdown jsonb)`, unique on `(user_id, date)` (upsert
  `onConflict:"user_id,date"`, `snapshot.ts:49-52`). `total_value` is **net worth in USD**;
  `breakdown` is keyed by asset type, USD values (`vitals/types.ts:18-23`). Index
  `snapshots_user_date_idx` in `migrations/20260520_perf_indices.sql`.
- **Writers**: `writeSnapshot` (`lib/snapshot.ts:10-61`) and `backfillSnapshots`
  (`:174-306`). Called from: the daily cron `api/cron/snapshot/route.ts`, and the chat
  route after a mutation (`route.ts:1087-1102`). `vital_snapshots` written by
  `writeVitalSnapshots` (`vitals/persist.ts`) from the same cron.
- **Cron**: yes — `vercel.json` `"/api/cron/snapshot"` at `0 0 * * *` (midnight UTC),
  guarded by `CRON_SECRET` bearer (`api/cron/snapshot/route.ts:8-11`).
- Net worth in snapshots uses **equity** for real estate
  (`value − computeCurrentBalance`): `snapshot.ts:30-36,40-45`.

### 2.2 "Past month" change & percentage on the hero

`src/components/NetWorthHero.tsx:54-69,116-130`.

```ts
// NetWorthHero.tsx:55
const baseValue = seriesStart?.total_value;          // = series[0], earliest snapshot in range
const rangeAbs  = … netTotal - baseValue …;
const rangePct  = … (rangeAbs / baseValue) * 100 …;  // %
const showPct   = (seriesStart?.total_value ?? 1000) >= 1000;  // only guard
```

**Current behavior:** The "past month" baseline is simply **the first snapshot in the
selected range window** (`series[0]`), not a robust baseline. The percentage is
`(now − first) / first × 100`. The **only** sparse-history guard is suppressing the
% when `series[0].total_value < 1000` (`:66`).

**Notes/divergence:** This is exactly the "+4,499% past month" path. If the earliest
snapshot in the month window is a near-zero-but-≥€1000 starting value (e.g. the day a
single small position was first logged, before backfill or before larger assets were
added), the denominator is tiny and the percentage explodes. There is no "needs ≥N days
of history" or "ignore inception spikes" logic; `RANGE_DAYS` simply filters by date
(`api/snapshots/route.ts:4-35`), and `gt("total_value",0)` is the only floor.

### 2.3 The projection figure ("€X by 2036")

`src/components/scenario/ProjectionTeaser.tsx` → `POST /api/scenarios/project`
(`api/scenarios/project/route.ts`) → `assembleProject` (`scenario/project-assemble.ts`)
→ `computeProjection`, with the growth rate from `deriveGrowthRate`
(`scenario/projection.ts:57-107`).

**Current behavior:**
- Rate = realized annualized nominal return over the snapshot window:
  `rate = (last/first)^(365/days) − 1` (`projection.ts:90`), with guards:
  `< 2 snapshots` or `< 90 days` or `first < 1000` ⇒ **default 5%** fallback
  (`:80-88`); otherwise the rate is **clamped to ±30%/yr** (`RATE_CLAMP=0.3`, `:92-93`).
- The teaser renders `compact(resp.trajectory.mid)` for `year = thisYear + 10` (2036)
  (`ProjectionTeaser.tsx:62,95-97`). Horizon 10y, no contribution.
- **Thin-history guard** in the teaser only suppresses the figure when the route
  returned a **default-rate** assumption string OR `startUsd < 1000`
  (`ProjectionTeaser.tsx:26-28,60`).

**Notes/divergence:** The thin-history guard does **not** catch the *clamped* case. With
≥2 snapshots spanning ≥90 days and a small-but-≥€1000 first value, `deriveGrowthRate`
returns the **clamped 30%** rate (not the default), so `isThinHistory` is false and the
teaser shows a real figure. 30%/yr compounded over 10 years is ~13.8×; off an
inflated/early base this yields the "€15M by 2036" headline. The baseline pathology is
shared with 2.2 (first snapshot used as denominator/seed).

---

## CLUSTER 3: Mortgage & amortization

### 3.1 Where mortgage/property data is stored

`real_estate` columns on `assets` (type `RealEstateAsset`, `supabase.ts:58-73`; written
in `apply-changes.ts:274-298`):
`value`, `currency`, `country`, `address`, `latitude`, `longitude`, `photo_url`,
`property_type`, `size_sqm`, `mortgage_balance`, `mortgage_balance_recorded_at`,
`mortgage_rate`, `monthly_payment`, `mortgage_type` (`annuity|linear|interest_only`),
`mortgage_start_date`, `mortgage_end_date`. Shared base columns include
`buy_price`, `buy_date` (`supabase.ts:44-51`).

### 3.2 acquisition_date / purchase_price / "owned since"

**Current behavior:** There are **no `acquisition_date` or `purchase_price` columns**
(grep returns nothing). The closest structured fields are the generic `buy_date` /
`buy_price` (base columns) and `mortgage_start_date` / `mortgage_end_date`. For property
adds, the system prompt's real-estate field list (`claude.ts:201-207,256-264`) does
**not** instruct capturing a purchase/acquisition date into any structured field — only
mortgage fields, address, property_type, size_sqm. `mortgage_start_date` is accepted by
`apply-changes.ts:290` if Claude supplies it, but the prompt never elicits it.

`MortgageBlock` derives the projection anchor as
`mortgage_start_date ?? mortgage_balance_recorded_at` (`MortgageBlock.tsx:62`), and
`mortgage_balance_recorded_at` is set to **`new Date().toISOString()` at insert time**
(`apply-changes.ts:286`). So when no start date is stated, "owned since" / the chart's
start effectively defaults to **record-creation time**.

**Notes/divergence:** Matches the symptom — purchase date lands in the narrative
(`personal_context`) not a structured column, and the amortization anchor defaults to
record creation, producing the impossible "owned since / years to go" framing.

### 3.3 The monthly payment (and the fabricated €1,000)

**Current behavior:** No default/fallback for `monthly_payment` exists in code:
`apply-changes.ts:269` `let resolvedMonthlyPayment = change.monthly_payment ?? null;`
and inserts it as-is (`:288`); edit path `:429`. So **the value originates from the
LLM**. The system prompt's `<changes>` examples actively supply made-up payments:
`claude.ts:172-173` (`"monthly_payment":4200`, `1400`) and `:811` (`2800`), and the
field list (`:201`, `:826`) lists `monthly_payment` with no "only if stated" guard.

**Notes/divergence:** The "€1,000/month" is an LLM-fabricated field, encouraged by
example-driven completion. There is no validation that the payment was user-stated.

### 3.4 Payoff date / "mortgage-free" / "years to go" / amortization curve

`projectMortgage` (`src/lib/mortgage.ts:77-179`); display in `MortgageBlock.tsx:65-111`.

```ts
// mortgage.ts (annuity branch) :138-147
if (endDate) totalMonths = monthsBetween(startDate, endDate);
else if (r > 0 && monthlyPayment > balance * r) {            // payment must exceed interest
  const remaining = Math.ceil(-Math.log(1-(r*balance)/monthlyPayment)/Math.log(1+r));
  totalMonths = elapsedMonths + remaining;
} else {
  totalMonths = elapsedMonths + 360;                          // <-- fallback: 30 years
}
```

**Current behavior:**
- The payment-vs-interest check exists **only inside the annuity branch** (`:142`). When
  the payment does **not** exceed monthly interest, it silently falls back to
  `elapsedMonths + 360` months (`:146`), i.e. **a flat 30-year term from `startDate`**.
  `remainingMonths = max(0, n − elapsedMonths)` (`:169`); `payoffDate = addMonths(startDate, n)`.
- The term is counted **from `startDate`/anchor, not from today**: `elapsedMonths`
  measured from `startDate` (`:87`); with the anchor defaulting to record creation
  (3.2), `elapsed ≈ 0`, so `remaining ≈ 360` ⇒ "30 years to go" and payoff `≈ now+30y`
  (= 2056). `computeCurrentBalance` has an analogous unguarded path for `linear`
  (`:39-44`) and returns `B0` unchanged when annuity payment ≤ interest (`:48-55`).
- `MortgageBlock.tsx:98-104` renders `mortgageFreeDate` from `payoffDate` and
  `yearsToGo = round(remainingMonths/12)`.

**Notes/divergence:** Confirms "mortgage-free 2056 / 30 years to go." Root cause is the
combination of (a) the fabricated low payment (3.3) failing the interest test, (b) the
360-month fallback, and (c) the anchor defaulting to record creation. The function does
*technically* test payment > interest, but only to choose the fallback — it does not
reject/flag an unpayable mortgage; it fabricates a 30-year schedule instead.

### 3.5 Interest-rate display ("4.0%" vs 4.05%)

**Current behavior:** Stored `mortgage_rate` is a plain percentage (e.g. `4.05`), stored
as-is (`apply-changes.ts:287`, `claude.ts:225` "mortgage_rate is a percentage — no
conversion"). Display divergence between two surfaces:
- `MortgageBlock.tsx:108`: `` `${rate.toFixed(1)}%` `` ⇒ **4.05 renders as "4.0%"**.
- Vitals Leverage card: `` `${v.mortgageRate.toFixed(2)}%` `` (`VitalsContent.tsx:607`),
  where `mortgageRate` is the balance-weighted rate (`leverage.ts:33,47-59`) ⇒ shows
  **4.05%** (2 decimals).

**Notes/divergence:** Stored value is 4.05; the MortgageBlock simply rounds to one
decimal. The two cards disagree (1 vs 2 decimals).

---

## CLUSTER 4: Vitals calculation bases

All vitals receive the **same EUR-normalized asset set** (`buildVitalsInputs` overrides
only `value = toUsd × eurRate`, keeping mortgage fields, `build-inputs.ts:58-61`).
`computeAllVitals` passes **all assets to every vital** — `scope` is render metadata, not
a compute-time filter (`vitals/index.ts:50-63`). The cards read the server value
directly (no client recompute — `DrawdownBars.tsx`, `LiquidityStack.tsx` just render
`data`).

### 4.1 Concentration

`src/lib/vitals/concentration.ts:23-95`.

**Current behavior:** Denominator `gross = Σ a.value` over **all assets including real
estate at GROSS value** (`:28`, real estate value is *not* reduced by mortgage). Reports
both gross (`topPositionPct`, `:38`) and **investable** (non-real-estate) fields
(`:69-81`). `band` uses `investableTopPositionPct ?? topPositionPct` (`:90-91`).

**Notes/divergence:** Property contributes at **gross**, not equity (diverges from the
"standardize on equity" goal in Cluster 6). The card chooses gross vs investable copy by
the `showProperty` lens (`VitalsContent.tsx:441-449`).

### 4.2 Liquidity Posture

`src/lib/vitals/liquidityPosture.ts:22-101`.

**Current behavior:**
- **Base/denominator** = `computeNetWorth` = `Σ assetContribution`, where real estate
  contributes **equity** `max(0, value − computeCurrentBalance)` and everything else its
  full value (`:95-101`). Percentages are `tier/netWorth` (`:59-69`).
- **Bucketing** by `liquidityTier(type)` (`:79-91`): `cash → same-day`;
  `stocks/etf/crypto/gold → 1w`; `bonds → 1mo`; `real_estate → 6mo+`;
  `pension → locked`; default/`other → 6mo+`.
- Chart legend (`LiquidityStack.tsx:12-18,59-65`) maps tiers to labels:
  same-day → **"% cash"**, 1w → "% market", 1mo → "% slow", 6mo+ → **"% property"**,
  locked → "% locked".

**Notes/divergence:** "0% cash" despite a €53k reserve = the reserve is **not stored as
`type:'cash'`** (it is the *only* type counted in the same-day "cash" bucket); a reserve
typed `pension`/`other`/`bonds` shows under locked/property/slow, not cash. "0% property"
with a large property = property **equity ≈ 0** (mortgage ≈ value), since the bucket uses
equity; combined with the equity denominator, the remaining liquid book (equities → 1w)
can read "100% within a week." The labels are hardcoded and conflate
type-tier ("cash" = same-day only) with intuitive categories.

### 4.3 Drawdown Vulnerability

`src/lib/vitals/drawdown.ts:20-76`.

```ts
// drawdown.ts
case 'real_estate':
  housingExposure += a.value;          // :41-44  GROSS property value
…
const housingShockEur = housingExposure * 0.15;            // :50
const combinedShockEur = equities*0.30 + crypto*0.50 + housing*0.15; // :51
const postShockNwEur = netWorth - combinedShockEur;        // :52
// netWorth = Σ (real_estate ? equity : value)            // :71-75  EQUITY base
```

**Current behavior:**
- **Base for `postShockNwEur`** = `computeNetWorth` with real estate at **equity**
  (`:25,71-75`).
- **Housing shock** is applied to **GROSS** property value (`:41-44,50`) — property is
  **included**, contrary to the symptom's "property excluded."
- `shockPctOfNw = combinedShock / netWorth` (`:53`).
- Card: hero `shockPctOfNw`, right-stat "Post-shock NW" = `postShockNwEur`, benchLine
  hardcoded `"equities −30%, crypto −50%, housing −15%"`
  (`VitalsContent.tsx:622-631`); `DrawdownBars` draws the three shock bars from the value.

**Notes/divergence (important):**
- **Mixed base bug:** `netWorth` (the post-shock base) counts property at **equity**,
  but `housingShockEur` is computed on **gross**. So the shock subtracted can exceed the
  property's contribution to the base — the base and the shock are on different bases.
  This is the actionable code-level defect.
- **vs symptom "Housing −15% → −€0 / property excluded":** the code does **not** exclude
  property; with a real `real_estate` asset, `housingShockEur` would be non-zero. A
  rendered "−€0" therefore implies **no asset is typed `real_estate` in the vitals set**
  (housingExposure summed to 0) — i.e. a data-typing condition, not what this function
  would otherwise produce. "Post-shock NW €135k looking like the equities book" is
  consistent with the same condition (property absent from `netWorth`). **Recommend
  reproducing against the actual user's asset rows** to confirm whether the property is
  mistyped vs. a compute bug; per the code as written, property is in-scope. Either way,
  the equity-vs-gross base inconsistency should be standardized (Cluster 6).

### 4.4 Hardcoded vs LLM copy (Vitals)

- **Hardcoded strings**: all card eyebrows/labels/benchlines/suggestions in
  `VitalsContent.tsx` (e.g. drawdown benchLine `:631`, leverage `"NL average LTV: 52%"`
  `:609`, all `*Suggestion()` bodies `:104-440`), chart labels in
  `DrawdownBars.tsx:20-24` and `LiquidityStack.tsx:12-18`, perspective context lines
  (`perspective.ts:83,90,97`), and the thin-pulse fallback (`pulse-generator.ts:46`).
- **LLM-generated**: only the **Pulse sentence(s)** (Haiku, `pulse-generator.ts:56-114`)
  — and only when there are >3 active vitals; ≤3 uses the deterministic `buildThinPulse`.

---

## CLUSTER 5: Chat extraction & confirmation

### 5.1 Chat route & system prompt

Route: `src/app/api/chat/route.ts`. Claude integration builds the system prompt in
`src/lib/claude.ts`: `buildStaticSystem` (returning users, `:18-561`),
`buildOnboardingPrompt` (new users, `:648-980`), and `buildDynamicContext`
(`:563-646`). Shared blocks in `src/lib/prompt-blocks.ts`
(`PRICE_KNOWLEDGE_BLOCK`, `IMAGE_IMPORT_BLOCK`, `OPTIONS_BLOCK`, `CHIPS_RULES_BLOCK`,
`clarifyBlock`). Model `claude-sonnet-4-6`, system passed as cached static block +
uncached dynamic context (`route.ts:591-595`).

The full returning-user prompt is `claude.ts:18-561` and the onboarding prompt is
`claude.ts:648-980` (quoted by reference rather than re-pasting the ~900 lines here;
both are reproduced verbatim in those line ranges). Salient points for this cluster:
- It explicitly exposes structured field names in examples and prose-adjacent
  instructions (`buy_date`, `buy_price`, `monthly_payment`, `mortgage_rate`,
  `value_delta`, etc.) — e.g. `claude.ts:182-207,256-264,277,422-535`. It does instruct
  "Never mention JSON, tag names" (`:560`), but the field tokens leak into reasoning.
- It instructs the model to *narrate server mechanics* in several places ("the system
  will auto-fill", "the server resolves units", "live price") — e.g. `:41,199,459,465`.
  The APP KNOWLEDGE block (`:549-558`) similarly describes caching/snapshot internals.

### 5.2 How a user message becomes asset/mutation fields; fields captured

Claude emits a `<changes>` (commit) or `<propose_change>` (gated) JSON array; the route
extracts the tag (`route.ts:658-666`), and `applyPortfolioChanges`
(`apply-changes.ts:81-535`) maps fields → `assets` insert/update + a `mutations` row.
Captured fields per the `PortfolioChange` type (`apply-changes.ts:29-55`):
- **Securities** (`stocks/etf/crypto/gold/bonds`): `name, type, value, currency, country,
  symbol, units, buy_price, buy_date, buy_price_source, value_delta`. Units/value are
  resolved against live/historical Yahoo prices (`:113-264`).
- **Property** (`real_estate`): `mortgage_balance, mortgage_rate, monthly_payment,
  mortgage_type, mortgage_start_date, mortgage_end_date, address, property_type, size_sqm,
  latitude, longitude` (`:42-52,285-296`).

### 5.3 Property acquisition date / purchase price — structured vs narrative

**Current behavior:** For property, **no acquisition-date or purchase-price field is
elicited or written to a structured column.** The `<changes>` real-estate field lists
(`claude.ts:201-207,256-264,814-826`) omit `buy_date`/`buy_price`/`mortgage_start_date`
from what the model is told to capture for a property; the example narratives push the
date into `personal_context` (a free-text ledger note, required at `:521-527`). The
generic `buy_date` *column* exists and would be honored by `apply-changes.ts:283/290`,
but nothing in the prompt routes a property's purchase date there.

**Notes/divergence:** Confirms "drops the property purchase date into the note instead of
structured fields."

### 5.4 Pre-save confirmation summary

`<propose_change>` → server builds a "Resolved:" block by calling `resolveProposal` per
proposal (`route.ts:804-828`, `proposal-resolver.ts:35-145`).

**Current behavior:** The summary is **not a full field echo.** The prose rules forbid
the model from listing fields/numbers — "states only what you're proposing in user terms
(not JSON, not numbers — the server appends resolved figures)" (`claude.ts:121-124,
140-149`). `resolveProposal` only produces specific one-liners for: **remove**
(`:38-48`), **value_delta edit** (`:50-79`), **historical re-derivation edit**
(`:82-103`), and **value-mode tradeable add** (`:105-135`). For everything else it falls
through to `Add {units} {sym} shares…` (`:137-141`) or `Update {name} position`
(`:144`). **Property adds have no dedicated branch** — there is no echo of value,
mortgage balance, rate, payment, type, or address in the confirmation. (Property usually
routes through the separate `<propose_address>` flow, `route.ts:702-730`, which echoes
only the canonical address line, not the financial fields.)

**Notes/divergence:** Confirms "doesn't echo all fields before saving." The confirmation
lists, at most, the one or two resolved numbers relevant to a tradeable; it never
enumerates every field being committed.

---

## CLUSTER 6: Mutations invariant & property basis

### 6.1 Mutations table & coverage

**Schema** (inferred from inserts in `apply-changes.ts` and the `Mutation` type
`supabase.ts:137-156`): `mutations(id, user_id, asset_id, asset_name, asset_type,
symbol, action ('add'|'edit'|'remove'), before_value, after_value, before_units,
after_units, currency, personal_context, market_context, portfolio_total, occurred_at,
recorded_at)`. `asset_id` FK is **`ON DELETE SET NULL`** (comment `apply-changes.ts:489`),
so remove rows persist with null `asset_id`.

**Current behavior — does every write path emit a mutation row?** Mostly yes, with
exceptions:
- **add**: inserts a mutation (`apply-changes.ts:306-323`). ✔
- **remove**: inserts the mutation **before** deleting the asset (`:492-512`). ✔
- **edit**: inserts a mutation **only if more than the name changed** —
  `onlyNameChanged` (a pure rename) **skips the mutation** (`:450-451`). ✗ (intentional)
- **edit with no matching asset**: silently no-ops (the `if (existing)` guard,
  `:332`) — no mutation, no error row.
- **Price-drift auto-patches** in `useAssets.fetchPrices` update `assets.value/symbol/
  currency` directly (`hooks/assets.ts:167-183`) with **no mutation row** (these are
  re-pricings, not user actions).
- The daily snapshot/vital writes and pulse/insight regenerations are not mutations.
- The **agent loop** path (`lib/chat/agent-tools.ts`, flag-gated OFF) wraps the same
  `applyPortfolioChanges`, so the same invariants apply when enabled.

### 6.2 Property in net worth & allocation — equity vs gross (every site)

| Site | File:line | Property treatment |
|---|---|---|
| Snapshot net worth + breakdown | `snapshot.ts:30-45` | **Equity** (`value − computeCurrentBalance`) |
| Backfill snapshots | `snapshot.ts:269-272` | **Equity** |
| Portfolio page net worth | `page.tsx:84-90` | **Equity** |
| `useNetWorth` (Profile perspective base) | `hooks/netWorth.ts:13-23` | **Equity** |
| Vitals net-worth base (build-inputs) | `build-inputs.ts:53` (`computeNetWorth` in `utils.ts`) | **Equity** |
| Liquidity base + property tier | `liquidityPosture.ts:95-101` | **Equity** |
| Drawdown net-worth base | `drawdown.ts:71-75` | **Equity** |
| Drawdown **housing shock exposure** | `drawdown.ts:41-44` | **GROSS** ⚠ |
| Concentration denominator + top position | `concentration.ts:28,38,41` | **GROSS** ⚠ |
| Leverage `debtToAssetsPct` / property value | `leverage.ts:27,29` | **GROSS** property value (by design for LTV) |
| Dynamic chat-context total | `claude.ts:578-582` | **Equity** (total); but `byType` allocation uses **GROSS** `a.value` (`:584-588`) |
| Remove running-total accounting | `apply-changes.ts:483-487` | **Equity** (matches `computeNetWorth`) |

**Notes/divergence:** Net-worth totals are consistently **equity** everywhere. The
**outliers to standardize** are: **concentration** (gross), **drawdown housing shock**
(gross, against an equity base — the 4.3 inconsistency), and the chat dynamic-context
**allocation `byType`** (gross while the headline total is equity, `claude.ts:584-588`).
Leverage intentionally uses gross property value for LTV and should likely stay.

---

## Open questions for implementation

1. **Drawdown property reproduction.** Per code, `real_estate` is included in the housing
   shock (gross). The symptom ("−€0 housing", "post-shock NW = equities book") implies the
   user's property is **absent from / mistyped in** the vitals asset set. Need a repro
   against real rows to decide whether the fix is (a) the equity/gross base unification
   only, or (b) also an asset-typing/data path. Which?
2. **Standard property basis.** Confirm the target is **equity everywhere** including the
   drawdown housing shock (apply −15% to *equity*, or to gross then recompute equity?) and
   concentration. Should Leverage keep **gross** property value for LTV (recommended)?
3. **Baseline policy (hero % and projection).** Define the minimum baseline (age in days
   and/or floor value) and whether to exclude inception/early snapshots. The projection's
   `RATE_CLAMP=0.3` "clamped" case currently bypasses the teaser's thin-history guard —
   should clamped rates also suppress the headline figure?
4. **Reactivity contract.** Choose the cross-surface refresh mechanism (the codebase has
   no React Query/SWR or `revalidate`): a shared client cache + an event bus
   (the `window "volnar:asset-restored"` pattern at `page.tsx:69-76` is a precedent), or
   server `revalidateTag`/server actions, or shortening the `useVitals` 1h TTL +
   `api/vitals` `max-age`. Which surfaces must update synchronously after a mutation
   (Vitals pulse, Profile context, Diary)?
5. **Mortgage anchor & unpayable detection.** Should `projectMortgage` *reject/flag* a
   payment ≤ monthly interest (surface "payment doesn't cover interest") instead of the
   silent 360-month fallback (`mortgage.ts:146`)? And require a real origination date
   (capture `mortgage_start_date`/acquisition date as a structured field) rather than
   defaulting the anchor to `mortgage_balance_recorded_at` = record creation?
6. **Monthly payment provenance.** Should `monthly_payment` (and `mortgage_rate`,
   `mortgage_type`) be accepted only when user-stated, with prompt/validation changes so
   the LLM stops fabricating them from examples? A `*_source` flag like `buy_price_source`?
7. **Rate display.** Standardize on `toFixed(2)` for `mortgage_rate` (MortgageBlock at
   `:108` currently `toFixed(1)`); confirm 2 decimals app-wide.
8. **Property confirmation echo.** Add a `resolveProposal` branch (or a dedicated
   property confirmation) that enumerates value, mortgage balance, rate, payment, type,
   and address before commit — currently absent (`proposal-resolver.ts:137-144`).
9. **Chat field-name leakage.** Decide how much of the prompt's structured-field and
   server-mechanic language to remove from model-facing instructions to stop the
   assistant exposing `buy_date`/`buy_price` and over-explaining server internals.
10. **Rename / no-op edits.** Pure renames and unmatched edits write no mutation
    (`apply-changes.ts:332,450-451`). Intended for the append-only audit trail, or should
    renames be logged?
