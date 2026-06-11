# Current Features

## Implemented and Working

### Authentication
- **Google OAuth** via Supabase Auth
- **Email magic link** as fallback
- **Session management** via cookies
- **Middleware route protection** redirects unauthenticated users to `/login`
- **Auto-creates user record** on first signup via Supabase trigger
- Files: `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

### Account Deletion
- Permanent, irreversible deletion from the Profile account area. A low-emphasis 'Delete account' affordance opens a confirmation requiring the user to type `DELETE`; the confirm button stays disabled until it matches.
- On confirm: `DELETE /api/users/me` runs, then the client signs out and redirects to `/login`.
- `DELETE /api/users/me` resolves the user id from the session only (never the request body), returns 401 unauthenticated, then runs in order: (1) **purges the user's `property-photos` Storage objects** (lists the `{user_id}/` prefix and removes every object, paging until empty — tolerates a missing/empty folder); (2) an explicit per-table delete loop over the user-scoped tables `messages, highlights, goals, snapshots, mutations, assets, diary_summaries, vital_snapshots, scenarios` (each keyed by `user_id`); (3) deletes the `users` row; (4) deletes the auth user via `auth.admin.deleteUser` **last**. `rate_limits` is left to its `ON DELETE CASCADE` on `users(id)`; `fx_rates` (global) and `price_index_cache` (region-keyed) are intentionally untouched. Every step is idempotent, so the operation is safely re-runnable while the session is still valid; any step failure is captured to Sentry and returns 500 with a clear message rather than a silent partial success.
- Complete data erasure: every user-keyed table, the Supabase auth user, and user-owned Storage are removed.
- Satisfies GDPR right-to-erasure and the Apple App Store in-app-deletion requirement.
- Files: `src/app/api/users/me/route.ts`, `src/app/profile/page.tsx`

### Mobile-First Route Architecture
- Five primary routes: `/` (Portfolio), `/diary`, `/chat`, `/profile`, `/vitals`, plus `/asset/[id]` for detail pages
- No separate `/settings` route — preferences live on Profile (per Decision 5)
- `BottomNav` renders on every route, including `/chat` (layout hardened with `height: 100dvh` + `padding-bottom: calc(64px + env(safe-area-inset-bottom))`)
- Active tab highlighted in accent green via `usePathname()`
- Browser back button and direct linking work across all five
- On desktop, the chat route falls back to the floating `ChatPopup` widget pattern. ChatPopup is context-aware: when opened over `/asset/[id]` it pre-fills the input with `Tell me about my <name>.`
- Files: `src/app/page.tsx`, `src/app/diary/page.tsx`, `src/app/chat/page.tsx`, `src/app/profile/page.tsx`, `src/app/vitals/page.tsx`, `src/app/asset/[id]/page.tsx`, `src/components/BottomNav.tsx`

### Portfolio Dashboard
- Header (`NavBar`): first name (`name.split(' ')[0]`) on the right (suppressed on the Profile tab — the page body already states the name); refresh button with integrated 4px status dot. No avatar, no Volnar wordmark, no settings gear. Dot states: **green** = all symbols fetched live within the last 5 minutes; **amber** = partial live prices OR prices are known-fresh (< 5 min) but the current session's fetch is still in-flight ("Refreshing prices"); **faint** = no recent price data. Dot uses a persisted timestamp (`volnar.prices.ts.<userId>` in sessionStorage) so it reflects actual data age, not session presence.
- Net worth hero in serif (Source Serif 4) at 54px, monochrome currency. Asset-detail heroes use the editorial dimmed currency prefix at their smaller (44–48px) sizes. No gross/debt subtitle even when mortgages exist.
- Change pill on the hero: percentage + EUR delta vs 1 month ago (or vs the first snapshot in the selected range), with explicit `+`/`−` signs and `accent-soft` / `negative-soft` background. Renders only when at least 2 historical snapshots exist.
- Net worth chart between hero and Holdings — range pills `1W / 1M / 3M / 1Y / 3Y / All`, straight-line segments in accent green connecting each snapshot point exactly (no smoothing), end-point dot, scrub/hover marker, Y-axis price labels (IBKR-style, no gridlines), empty state until 2 snapshots exist.
- WORTH KNOWING insight band (in the slot the milestone bar previously occupied) — Claude-generated single italic-serif sentence, accent-soft tinted band, chevron right, tap navigates to `/chat`. Renders nothing when the API returns `{ detail: null }`.
- Holdings list — grouped by semantic category (Property = `real_estate`; Public markets = `stocks`, `etf`; Reserves = `cash`, `pension`, `bonds`, `gold`, `other`; Crypto = `crypto`). Group order by total value descending. All collapsed by default, tap to expand, session-persisted. Each position inside renders via `PositionRow`. Capital (`dc`) pensions count in Reserves; **income (`db`/`state`) pensions are off-balance** — excluded from the four groups and shown in a separate "Future income" section below them (see Pensions (Two-Shape Model)).
- No "Allocation" card (proportional bars in HoldingsGroup headers carry the same information).
- No "Recent Activity" preview (mutations remain accessible via `/diary`).
- No stat cards (Positions / Countries / Asset classes / Largest were removed — raw counts didn't drive decisions; see `next-build-plan.md` for the replacement plan).
- Files: `src/app/page.tsx`, `src/components/PortfolioTab.tsx`, `src/components/NetWorthHero.tsx`, `src/components/NetWorthChart.tsx`, `src/components/HoldingsGroup.tsx`, `src/components/PositionRow.tsx`, `src/components/MiniSparkline.tsx`, `src/components/InsightBand.tsx`

### Daily Snapshots & Net Worth Trend
- Vercel cron writes daily snapshots at midnight UTC, secured via `CRON_SECRET` header
- `writeSnapshot()` shared writer also fires fire-and-forget on every successful mutation in `/api/chat` so the chart stays fresh between cron runs
- Idempotent upsert on `(user_id, date)` — multiple writes same day produce one row, last value wins
- **Snapshot cadence is portfolio-aware** (`targetSnapshotDates`): portfolios holding any tradeable asset (stocks/ETF/crypto/gold) keep the existing daily-30d / weekly-30d-to-1y / monthly-beyond-1y cadence. Portfolios with **no** tradeables (property-only, cash-only, etc.) use a **monthly-only cadence** — the first of each month from the earliest holding to today — since their underlying values don't move within a month. `writeSnapshot` always writes today's row regardless of cadence.
- **Month-anchored property/FX contributions**: for every snapshot date, a real-estate asset's value, mortgage balance, AND the FX rate used to convert it are all evaluated **at the first of that date's calendar month** (`YYYY-MM-01`, clamped forward to the asset's acquisition date if later) — including the current month. There is no special case for "this month anchors to today." Stocks, ETFs, cash, bonds, and pensions remain at exact-date / live-value granularity — only real estate is month-anchored.
- Net worth chart on Portfolio tab consumes via `/api/snapshots?range=...`, with the live current value appended as today's endpoint. Supported ranges: `1W`, `1M`, `3M`, `1Y`, `3Y`, `All`.
- Files: `src/app/api/cron/snapshot/route.ts`, `src/app/api/snapshots/route.ts`, `src/lib/snapshot.ts`, `vercel.json`

### AI Insight Band
- Single italic-serif sentence on Portfolio replacing the legacy milestone bar
- **Thin-portfolio handling**: portfolios of 1–3 assets return deterministic copy without calling Haiku — names the held positions and highlights the most common absent categories (cash, pension, property). No LLM cost. Portfolios of 4+ assets call Claude Haiku for a two-sentence observation.
- Generated per user, cached 24h in `highlights` table (`type='insight'`, `detail=<sentence>`, `expires_at = now() + 24h`). No new schema.
- `/api/insight` GET returns cached row if non-expired; generates fresh, INSERTs, returns on miss. On failure returns `{ detail: null }` and does NOT INSERT.
- **Revision-driven freshness**: `useInsight()` subscribes to the portfolio-revision store (like the holdings list and Vitals). On a portfolio change it force-refetches `/api/insight?fresh=1`, which regenerates the band's concentration card from the **current** assets before returning. The band can no longer name a removed asset — the deterministic figure is always recomputed from current assets; only the phrasing is cached.
- LLM marks the key noun phrase with `*asterisks*`; the frontend wraps that span in `<em>` for italic styling
- Cost: ~$0.0001–0.0003 per Haiku call (waived for thin portfolios)
- Tap navigates to `/chat`
- Files: `src/app/api/insight/route.ts`, `src/lib/insight-generator.ts`, `src/components/InsightBand.tsx`, `src/lib/hooks.ts` (`useInsight()`)

### Asset Detail Pages (Read-Only)
- Four layout variants dispatched by asset type from `src/app/asset/[id]/page.tsx` (pension routes through the `PensionDetail` dispatcher to a capital or income layout)
- All three are read-only — no inline edits, no delete button, no Discuss CTA on the page. Modifications happen via chat, which captures reasoning at the moment of change.
- Top bar: back chevron (left); on TradeableDetail, a refresh button (right) re-fetches live price for this asset
- Context-aware Chat tab: from any asset detail page, the bottom-nav Chat tab routes to `/chat?asset=<id>` and pre-fills the composer with `Tell me about my <name>.`

**Tradeable** (stocks, ETFs, crypto, gold):
- Asset logo, serif name, units sub-line, "Market price" hero with editorial currency prefix, change pill (explicit signs, no arrow)
- Full price chart with time-range tabs (`1D / 1W / 1M / 3M / 1Y / 3Y`); chart treatment matches NetWorthChart exactly — no card wrapper, flush to page surface, same gradient fill (0.18→0 opacity), same end-point dot (halo + solid, r=6/3), same stroke width (1.5px), date axis labels (start left / end right, `var(--text-faint)`, 12px) below the SVG, same range-pill tinted track (`var(--surface-elev)`, borderRadius 10) with active pill on `var(--bg)` background
- "Your position" list: Current value / Total return (with %) / Avg buy (with year)
- Activity timeline scoped to the asset; prefers unit-based deltas (`+5 shares`) for tradeable mutations, falls back to signed value delta or context-only for older entries
- Crypto positions show a 24h volatility block; stocks do not. Crypto rows hide country.

**Real Estate** — property hub with:
- `PropertyMap` (sole visual; no photo upload). MapLibre GL JS on OpenFreeMap tiles; theme-aware via `useTheme()` (light style at `src/styles/map-light.json`, dark style at `src/styles/map-dark.json`). Auto-caches first render as PNG to Supabase Storage at `property-photos/<user_id>/<asset_id>-<theme>.png`; falls back to live render if the cached PNG 404s
- Accent green pin overlaid on map
- Address subtitle, "Equity" hero (computed: `value − computeCurrentBalance(asset)`), equity-vs-property-value pill (`+€X since YEAR`)
- `ValueComposition` bar (equity vs mortgage)
- Property list row (Value)
- `MortgageBlock` (read-only): Balance / Rate / Payment / Type / Mortgage-free as list rows. Balance is the auto-amortized current value (not the stored anchor). Payoff chart with `TODAY` marker positioned at the computed balance, accent stroke throughout, dashed vertical with accent dot
- Activity scoped to the asset

**Pension** (capital pot / income entitlement):
- Dispatched via `PensionDetail`: a `dc` pot renders `PensionCapitalDetail` (value hero, growth / contribution / access-age rows, a deterministic projection card, locked note); a `db`/`state` entitlement renders `PensionIncomeDetail` (a "Guaranteed income" hero phrased "€X / year", off-balance banner, now→start-age timeline, never a net-worth figure). Shared `PensionActivity` shows the corrected verb. See **Pensions (Two-Shape Model)** below.

**Static** (cash, bonds, other):
- Asset logo (wallet for cash; certificate for bonds; monogram for gold/other), serif name
- Balance hero with editorial currency prefix; positive/negative pill for current-year delta
- Native-currency subtitle for transparency (e.g., a USD cash pot shows `USD` below the EUR-equivalent balance)
- For bonds: `BondBlock` with issuer / coupon (with annual income) / maturity (with time-to-maturity) / ISIN as read-only list rows
- Activity scoped to the asset

- Files: `src/components/asset-detail/{TradeableDetail,RealEstateDetail,StaticDetail,PensionDetail,PensionCapitalDetail,PensionIncomeDetail,PensionActivity,CryptoVolatilityBlock,BondBlock}.tsx`, `src/components/PriceChart.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`

### Real Estate & Mortgage Tracking
- Properties stored as assets with `type = 'real_estate'`
- Mortgage fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type` (annuity/linear/interest_only), `mortgage_start_date`, `mortgage_end_date`, `mortgage_balance_recorded_at`
- Property fields: `address`, `latitude`, `longitude`, `photo_url`, `property_type`, `size_sqm`
- **Auto-amortization**: stored `mortgage_balance` is the balance at `mortgage_balance_recorded_at` (set on every write that touches mortgage_balance). `computeCurrentBalance(asset, asOf=today)` in `src/lib/mortgage.ts` projects forward to today using the mortgage schedule. Every read site (net worth, equity hero, value composition, MortgageBlock stat tiles, payoff TODAY marker, Claude's portfolio context) goes through the helper. For `interest_only`, balance stays flat.
- Equity calculated as `value − computeCurrentBalance(asset)`. Net worth uses equity, not gross.
- `MortgageBlock` renders read-only stat rows + payoff projection chart with TODAY marker, accent green styling
- Linear mortgages render a straight line; interest-only mortgages show `—` for mortgage-free date
- `PropertyMap` renders with the theme-appropriate style; pin is accent green. After first render, captures the canvas as PNG and uploads to Supabase Storage. Subsequent loads serve the cached PNG; on miss, falls back to live render.
- Address geocoding via OSM Nominatim happens server-side when a property is added via chat
- Country-agnostic — pure math, no tax assumptions
- **Historical reconstruction (snapshot history)**: see "Historical Reconstruction (Real Estate & Mortgage)" below for how past equity and mortgage-balance points are derived.
- Files: `src/components/asset-detail/RealEstateDetail.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/lib/mortgage.ts`, `src/lib/maps.ts`, `src/app/api/geocode/route.ts`, `src/lib/geocode.ts`, `src/styles/map-light.json`, `src/styles/map-dark.json`

### Historical Reconstruction (Real Estate & Mortgage)
- **Property value**: each historical snapshot date's property value is reconstructed by fitting the CBS regional price index (PBK) **shape** between two anchors — `buy_price` at `buy_date`, and the asset's current `value` at today. The fit uses **monotone-cubic (Fritsch-Carlson / PCHIP) interpolation at fractional-year (month) precision** over the CBS yearly index points, then is rescaled so the curve passes through both anchors exactly. CBS supplies the *shape* of the curve only — it never determines the endpoints.
- **Fallback**: when the CBS region can't be resolved, or fewer than 2 index points are available, the value is reconstructed by **linear interpolation in time** between the two anchors instead.
- **Acquisition guard**: a property contributes nothing to any snapshot dated before its `buy_date` — no fabricated pre-purchase history.
- **Mortgage balance**: for each real-estate asset, a smooth historical balance curve is built via `projectMortgage` (the same basis `MortgageBlock` uses), sampled at fractional-month resolution between `mortgage_start_date` (falling back to `buy_date`) and today. The balance at every historical date is **clamped to `[0, grossValue]`**, so early-history equity is never negative. When `projectMortgage` can't build a schedule (missing rate/payment/start), the balance falls back to `computeCurrentBalance(asset, anchorDate)`.
- **Rebuild trigger**: a mortgage or value edit on a property triggers a snapshot rebuild from that property's acquisition date forward (`apply-changes.ts` / `/api/chat`), so historical equity stays consistent with the latest inputs.
- Files: `src/lib/snapshot.ts`, `src/lib/mortgage.ts`, `src/lib/cbs-pbk.ts`, `src/lib/property-region.ts`, `src/lib/property-estimate.ts`

### Pensions (Two-Shape Model)
- Pension is **one asset class** (`type='pension'`) with two economic shapes, selected by `pension_kind`: **capital** (`dc`) and **income** (`db` | `state`). `pension_kind` null is treated as capital (legacy rows backfilled to `'dc'`). Shape helpers live in `src/lib/pension.ts` (`pensionShape`, `isCapitalPension`, `isIncomePension`).
- **Capital (`dc`)** — a pot you own. Uses `value` (the pot), a growth assumption stored in `mortgage_rate` (the static-asset interest-rate convention, reused as a % per year — no conversion), and `access_age`. `monthly_contribution` and `pension_provider` are optional and recorded only if volunteered. **Counts toward net worth**, sits in the Reserves holdings group, and maps to the `locked` liquidity tier as before. Renders `PensionCapitalDetail` with a deterministic projection card.
- **Income (`db` = defined benefit, `state` = state / PAYG)** — a future income entitlement, not an owned balance. Uses `annual_income`; `access_age` (the start age) is optional and defaults to `DEFAULT_PENSION_ACCESS_AGE` (67) when not given, and `pension_provider` is optional and recorded only if volunteered. `value` is **NULL**. **Off-balance**: excluded from net worth, the gross total, allocation, and the four holdings groups. Shown instead in a separate **"Future income"** section in `PortfolioTab` (each row plus a subtotal as "€X / year", with a not-in-net-worth caption; tapping a row opens its detail page). Renders `PensionIncomeDetail` — an off-balance banner, a now→start-age timeline, and `annual_income` phrased "€X / year"; never a net-worth/value figure.
- **Detail routing**: `asset/[id]/page.tsx` branches pension to the `PensionDetail` dispatcher (capital vs income by `isCapitalPension`); `birth_year` is read from the `users` table and passed through so the capital projection and the income timeline can derive the user's current age. Cash / bonds / other stay on `StaticDetail`.
- **Projection (capital only, deterministic)**: `projectPension({ potValue, monthlyContribution, growthRatePct, yearsToAccess })` — monthly-compounded future value of the pot plus contributions, all outputs `Math.round`ed integers, guarded for `i = 0` and `yearsToAccess <= 0` (no NaN/Infinity). **The LLM never computes it.** The card is **hidden entirely** unless `value`, `mortgage_rate`, `access_age`, and `birth_year` are all present and `yearsToAccess > 0`; it shows the projected value, a Contributed-vs-Growth split bar, and `PENSION_PROJECTION_DISCLAIMER` ("An estimate of future value based on your inputs. Not financial advice.").
- **Shared Activity**: `PensionActivity` renders the corrected verb for both layouts — pension adds read **"Added"/"Recorded"**, never "Bought"; income amounts are phrased "€X / year".
- **Chat intake** (`PENSION_INTAKE_BLOCK` in `prompt-blocks.ts`): a **chips-first** flow under the no-cost-questions principle. A type-first fork (Workplace/private pot · Defined benefit · State pension · Not sure) precedes everything. For capital pensions, value, currency, growth assumption, and access age are asked — these remain required with no silent defaults. For income pensions, only annual income (and currency) is required; start age is offered as an optional chip set (`PENSION_INCOME_AGE_CHIPS`: 65 / 67 / 68 / Skip) and defaults to `DEFAULT_PENSION_ACCESS_AGE` (67) if skipped. Provider and monthly contribution are never asked — recorded only if the user volunteers them. A **mandatory confirmation echo** (`<propose_change>` → the server renders every captured field with "Looks right, add it" / "Change something" chips) gates the commit; nothing is written until the user confirms. A deterministic gate (`validatePensionChange` in `src/lib/pension-intake.ts`) re-checks completeness in both the echo step and the write path, so an incomplete pension can never be saved.
- **Known gaps (deferred by design)**: **indexation is not captured** — the income page shows Indexation: "Not captured"; there is **no in-payment / in-retirement transition**; and a **DB entitlement is never capitalized into net worth** (off-balance is the design, not a TODO).
- Files: `src/lib/pension.ts`, `src/lib/pension-intake.ts`, `src/components/asset-detail/{PensionDetail,PensionCapitalDetail,PensionIncomeDetail,PensionActivity}.tsx`, `src/app/asset/[id]/page.tsx`, `src/components/PortfolioTab.tsx`, `src/lib/prompt-blocks.ts`, `src/lib/proposal-resolver.ts`, `src/lib/apply-changes.ts`, `supabase/migrations/20260610_pension_two_shape.sql`

### Indicative Property Value (CBS-PBK)
- Replaces the dead WOZ integration (all WOZ code removed; `woz_cache` dropped) with a **deterministic, server-side indicative value**. No LLM produces the figure.
- **Method**: `currentValue = buy_price × (regionalIndex_now / regionalIndex_buyYear)` using the CBS *Prijsindex Bestaande Koopwoningen* (PBK, table 85792NED, base 2020 = 100, series from 1995). A purchase before 1995 clamps to the 1995 baseline (flagged as `clamped`).
- **Region**: resolved from the address via the free PDOK Locatieserver → gemeente + province; the index region is the province, or the city for the four big cities (Amsterdam, Rotterdam, 's-Gravenhage, Utrecht). **NL-only**; non-NL properties have no estimate.
- **CBS source — the single live-verify point** (`src/lib/cbs-pbk.ts`): legacy OData base `https://opendata.cbs.nl/ODataApi/odata/85792NED` (the v4 `datasets.cbs.nl` base 404s for this table and is an inert fallback). RegioS is matched by stripping the trailing group marker from the Title (e.g. `"Noord-Brabant (PV)"` → `"Noord-Brabant"`) and using the **Key exactly as returned, with trailing spaces** (e.g. `"PV30  "`). The measure is the one titled `Prijsindex verkoopprijzen` with a non-empty key (`PrijsindexVerkoopprijzen_1`) — NOT the empty-key group header `Prijsindex bestaande koopwoningen`. Periods are yearly `{YYYY}JJ00`.
- **Caching**: per-region series cached in `price_index_cache` (region-keyed, shared across users), refreshed when older than ~30 days; a miss degrades to a live fetch.
- **API**: `GET /api/property-estimate?assetId=...` returns `{ available, currentEstimate, series, regionName, regionCode, asOfPeriod, clamped }` (NL real-estate, authed user only) or `{ available: false }`. Everything is wrapped so it never throws. A gated `?debug=1` (authed) returns the intermediate CBS resolution and first-failing step for diagnosis.
- **Surfaces**: the asset detail page shows an "Indicative value" per-year chart (`EstimatedValueChart`), labelled as indicative (not an appraisal) with the region and reference period; the stated value is marked separately when it diverges. The chat add-flow suggests the figure on add.
- Files: `src/lib/cbs-pbk.ts`, `src/lib/property-estimate.ts`, `src/lib/property-region.ts`, `src/lib/property-estimate-resolve.ts`, `src/app/api/property-estimate/route.ts`, `src/components/asset-detail/EstimatedValueChart.tsx`, `supabase/migrations/20260606_price_index_cache.sql`

### Chat Property-Add Flow
- A property add is a deliberate two-step flow (`buildStaticSystem` and `buildOnboardingPrompt`, mirrored):
  - **Step 1 — confirm the address first.** The model emits `<propose_address>` once; the server geocodes and shows the resolved address with distinct **"Yes, that's the address" / "No, let me correct it"** chips (separate from the commit step's "Confirm and save", so confirming the address never saves a property). If the geocoder **changed** the entered postcode or house number (e.g. `5629NJ` → `5625NJ`), the change is surfaced in the confirmation; a non-resolvable / partial match asks the user to re-enter rather than forcing a best guess.
  - **Step 2 — anchor + value.** After the address is confirmed, the model asks for the **purchase price + date** (the anchor), framed by its purpose — "What was the purchase price (roughly)? This anchors the value history on the chart. And when did you buy it?" — as plain text. This is the only cost-history question asked anywhere for a real-estate add: no questions about renovations, taxes paid, or other historical spending. The model then emits `<propose_change>` — the only committable step and the only one that shows the indicative value ("Current value: about €X — accept or change"). The confirm echo lists every field that will be recorded, **including mortgage balance, rate and start date**.
  - **Step 3 — commit** via `<changes>` only after the `<propose_change>` confirmation.
- **No silent carry-forward**: mortgage and financial fields are recorded only from what the user states in the *current* add interaction — never carried forward from earlier messages or a removed-and-re-added property. A remembered figure must be confirmed before it is recorded.
- **Never commits a €0 property**: if no value is given and the estimate is unavailable (any non-NL property, or a CBS miss), the add is skipped and the user is asked for the current value — no asset or mutation is written.
- **Cost-basis honesty**: the acquisition mutation records the **purchase price** at `buy_date` (not the current estimate), so the diary reads "Bought €200,000 (2014)"; the detail equity badge shows real appreciation `value − buy_price`, with the "since YEAR" label taken from `buy_date`.
- Files: `src/lib/claude.ts`, `src/app/api/chat/route.ts`, `src/lib/proposal-resolver.ts`, `src/lib/apply-changes.ts`, `src/lib/geocode.ts`, `src/components/asset-detail/RealEstateDetail.tsx`

### Chat Add Flow — No Cost-Related Questions
Across every asset type, chat asks only the fields that are deterministically required to draw or track the asset going forward. Cost basis, historical contributions, original deposits, and "what did you pay" questions are never asked, with exactly one structural exception (real estate purchase price, above).

- **Tradeables (stocks, ETF, crypto, gold)**: a stated holding ("I have 100 ASML", "I bought 100 shares from Jan 2020") commits immediately via `<changes>`. The only two things ever asked are **quantity** (only when a number is genuinely ambiguous between units and a money amount) and **acquisition date** (only when none was given — any precision, including "track from now", is accepted). Cost basis (`buy_price`) is never asked about in any form. On commit, `getMonthClosingPrice` fetches Yahoo's month-end close for the stated `buy_date` and silently fills `buy_price` + `buy_price_source = "market"` when the user hasn't stated a price; the lookup is wrapped so a failure just leaves `buy_price` unset. A user-volunteered price ("100 Apple at $150") is respected verbatim and never overridden.
- **Real estate**: address, purchase price + date (the one allowed cost question, reframed as the chart anchor — see Chat Property-Add Flow), current value if needed, and mortgage fields if mortgaged. No questions about renovations, taxes, or other historical spending.
- **Cash / savings / bonds / other**: a plainly stated balance ("I have €5,000 in savings at ING") commits in one turn — name, current balance, and currency only. No questions about historical contributions, the original deposit, or when the account was opened.
- **Pensions**: see Pensions (Two-Shape Model) below — capital pensions ask for value, currency, growth assumption, and access age; income pensions ask for annual income, currency, and an optional start age. Provider and contribution are never asked (recorded only if volunteered).
- **Edits**: ask only about the field actually being changed — never re-interrogate other fields, including cost basis.
- **Removes**: confirm which asset to remove. No financial questions of any kind.
- The agent-loop tool-calling path (`src/lib/chat/agent-loop.ts`, flag-gated) mirrors this for tradeables: quantity/date are the only questions, and `commit_mutation` is called directly once they're settled — no `propose_mutation` step for a tradeable add.
- Files: `src/lib/claude.ts`, `src/lib/prompt-blocks.ts`, `src/lib/chat/agent-loop.ts`, `src/lib/chat/agent-tools.ts`, `src/lib/apply-changes.ts`, `src/lib/prices.ts` (`getMonthClosingPrice`)

### Real-time Prices
- Yahoo Finance via server-side API route at `/api/prices`
- **No EUR conversion in the price pipeline.** Returns native Yahoo prices: `{ symbol, price (native), previousClose (native), nativePrice, nativeCurrency, requested_symbol? }`
- GBp→GBP normalisation applied for UK pence-priced assets; all other currencies pass through unchanged
- Venue fallback: bare ticker symbols fan out to `venuePriorityFor(country)` exchange suffixes; first success wins. `requested_symbol` on the result reveals when a bare symbol was resolved to a qualified one (e.g. ZPRR → ZPRR.DE)
- FX rates (USD base) cached in `fx_rates` table with 24h TTL; 1-minute in-process memo; fallback to hardcoded constants. Source: frankfurter.app (ECB-backed, no key)
- Self-heal (in `useAssets`): when `nativeCurrency !== assets.currency` or resolver rewrote the symbol, writes `{ value = price × units, currency?, symbol? }` back in native currency
- `liveAssets` memo overlays `value = price × units` and `currency = nativeCurrency` on every asset — display code always uses these overlaid values
- Status dot in NavBar — age-based (see Portfolio Dashboard above for full definition)
- Manual refresh button in NavBar
- Day-change pills per position; `%` change is currency-neutral since `price` and `previousClose` share the same native currency
- Files: `src/app/api/prices/route.ts`, `src/app/api/fx/route.ts`, `src/lib/hooks.ts` (`useAssets`, `useLivePrice`), `src/lib/prices-server.ts`, `src/lib/venues.ts`

### Asset Logos
- Shared `AssetLogo` component used in DiaryTab and PositionRow
- Resolution order:
  1. **Cash / pension** → inline SVG wallet icon (purpose-pot framing per Decision 11; no Clearbit lookup)
  2. **Bonds** → inline SVG certificate icon (issuer is a tracked field on the asset, not the logo source)
  3. **Real estate** → inline SVG icons by `property_type` (house, apartment, office, land, other)
  4. **Crypto** → `/api/logo?type=crypto&symbol=<base>` proxy (server fetches from jsdelivr cryptocurrency-icons CDN)
  5. **Stocks/ETFs** → `/api/logo?type=stock&symbol=<symbol>` proxy (server fetches from Financial Modeling Prep)
  6. **Fallback** (gold, other, or any image error) → colored monogram badge
- Proxy route validates `type` and `symbol` (regex `/^[A-Za-z0-9.\-]+$/`, max 16 chars). In-process cache with 7-day TTL, FIFO eviction at 500 entries. `Cache-Control: public, max-age=604800, immutable`. CDN sees Vercel's edge IP, not the user's.
- Wrapper: 10px border radius, bg-surface, border (border dropped for crypto and stock variants since their logos carry their own weight)
- Files: `src/components/AssetLogo.tsx`, `src/app/api/logo/route.ts`

### Display Currency Parameterization (Phases A–D shipped)
- Per-user display currency stored on `users.display_currency` (EUR / USD / GBP, default EUR). Picker lives on Profile → Preferences.
- **Storage is native-per-asset.** `assets.value` holds the asset's native currency (Yahoo-reported for tradeables; country-derived for real estate). `fx_rates` keeps USD as its internal rate basis, but display and aggregation now go through a **direct cross-rate** (native → display in one step) via the shared `convertCurrency(amount, from, to, rates)` helper in `src/lib/currency-convert.ts`, with an identity short-circuit when `from === to`.
- `formatMoney(nativeValue, nativeCurrency, displayCurrency)` converts native → display directly via `convertCurrency` — same-currency values render with no conversion and no flash on load.
- **Net worth chart**: each snapshot row's `native_breakdown` (per-currency native sums, e.g. `{"EUR": 362000}`) is converted to the display currency directly via `convertCurrency`, with identity for entries already in the display currency. `total_value` (USD) converted via the live rate is used only as a fallback when `native_breakdown` is absent (older rows).
- **Number formatting is forced to `nl-NL` locale** for all currencies — `€616.086`, `$616.086`, `£616.086` (dot thousand separator, comma decimal). Intentional brand-consistency choice.
- Chat prompts are parameterized with `displayCurrency`; prose responses render in display currency, `<changes>` JSON stays native. Goal targets stated in display currency are converted to USD server-side before INSERT.
- Real estate native currency captured at add time from country (NL/DE/FR/ES/IT→EUR, US→USD, UK→GBP, other→EUR). `countryToCurrency()` helper in `src/lib/country-currency.ts`.
- Files: `src/lib/money.ts`, `src/lib/currency-convert.ts`, `src/lib/hooks.ts`, `src/lib/claude.ts`, `src/lib/apply-changes.ts`, `src/lib/country-currency.ts`, `src/lib/fx.ts`, `src/components/NetWorthHero.tsx`, `src/components/NetWorthChart.tsx`, `src/components/PositionRow.tsx`, `src/components/PortfolioTab.tsx`, `src/components/HoldingsGroup.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/components/asset-detail/*`, `src/components/DiaryTab.tsx`, `src/app/page.tsx`, `src/app/profile/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/diary-summary/route.ts`

### Theme System
- Two modes: **Light**, **Dark**. `auto` is not supported — `PATCH /api/users/me` rejects `theme=auto` with 400. The DB check constraint still lists `'auto'` for backward compatibility only.
- Stored on `users.theme` (text, check constraint `in ('auto', 'light', 'dark')`)
- `ThemeProvider` applies `data-theme="light"` or `data-theme="dark"` to the document root; tokens in `globals.css` swap automatically
- Picker lives on Profile → Preferences alongside the currency picker
- Cookie (`volnar.theme`) read in the root layout to set initial `data-theme` before hydration, avoiding flash
- `useTheme()` hook reads `users.theme`, `setTheme()` writes the cookie and PATCHes `/api/users/me`
- PropertyMap reacts to theme changes via `setStyle()` and uses a per-theme cached PNG path
- Files: `src/components/ThemeProvider.tsx`, `src/lib/hooks.ts`, `src/app/layout.tsx`, `src/app/profile/page.tsx`

### Portfolio Loading Performance

Several optimisations reduce the time-to-interactive on the Portfolio page:

**1. Progressive render — no price gate.** The page renders as soon as assets load from the DB. Live prices fill in reactively when `fetchPrices` completes. The previous `pricesLoaded` full-page block (worst-case 3 s skeleton) is gone.

**2. Single auth call via `UserProvider`.** `supabase.auth.getUser()` fires once at the app root and is shared via React context (`src/components/UserProvider.tsx`). Before this, every `useDisplayCurrency()` and `useUser()` call triggered a separate auth round-trip — including one per `PositionRow` render.

**3. Assets stale-while-revalidate (`sessionStorage`).** `useAssets` caches the DB asset list under `volnar.assets.<userId>`. On mount, the cache hydrates instantly and `loading` is set `false` immediately. Supabase revalidates in the background and writes the fresh list back. On mutation, `invalidateAssetsCache(userId)` clears the key before `refetchAssets()` fires. Cross-tab invalidation via `BroadcastChannel` is not yet implemented.

**4. `/api/dashboard-init` batched endpoint.** Replaces three separate authenticated requests (insight, 1M snapshots, mutations) with a single `Promise.all` on the server. Auth is verified once. The insight result pre-populates `_insightCache` so `InsightBand` renders without its own network call. The 1M snapshot data is passed as `initialSnapshots` to `NetWorthChart`, skipping its initial fetch.

**5. Sparklines stale-while-revalidate (`sessionStorage`).** `useSparklines` caches results under `volnar.sparklines.v1.<range>.<symbolKey>` with a 5-minute TTL. On mount, sparklines render from cache instantly; the batch fetch revalidates in background. `invalidateAssetsCache(userId)` also scans and removes all `volnar.sparklines.v1.*` keys.

**6. Price timestamp persistence.** The last successful price fetch timestamp is stored under `volnar.prices.ts.<userId>`. On remount (e.g., after tab switch), `lastUpdated` is initialised from this key so the NavBar status dot reflects actual data age, not session presence.

**Invalidation call sites** (both `invalidateAssetsCache` + sparkline bust): `use-chat-session.ts` `send()`/`sendText()` when `data.assets` is truthy; `UndoDeleteToast.tsx` `handleUndo()` after a successful restore.

- Files: `src/app/page.tsx`, `src/components/UserProvider.tsx`, `src/components/NavBar.tsx`, `src/components/NetWorthChart.tsx`, `src/components/PortfolioTab.tsx`, `src/lib/hooks.ts` (`useAssets`, `useSparklines`, `invalidateAssetsCache`), `src/lib/use-chat-session.ts`, `src/components/UndoDeleteToast.tsx`, `src/app/api/dashboard-init/route.ts`

### Conversational Assistant
- **Single continuous thread per user** (per Decision 3). No "new chat", "clear history", or "session list" affordances anywhere. The mental model is "talking to a person," not "starting a new chat."
- **Chips on every assistant turn** (per Decision 12). Every response emits 3–4 `suggested_replies` representing the user's most likely next moves. Chips render below the last assistant message on both chat surfaces. Exceptions: bare save confirmations ("Done.") and turns where prose already enumerates choices.
- Mobile: full-page route at `/chat`. Empty state shows an asset-class chip picker (Stocks & ETFs / Real estate / Crypto / Cash & savings / Pension & retirement / Other) that seeds the chat with context. Context-aware entry from asset detail or insight band opens with a synthetic assistant seed message + chips — typed input starts empty, not pre-filled.
- Desktop: floating popup (`ChatPopup`). Context-aware: when opened over `/asset/[id]`, renders a synthetic assistant seed message ("What would you like to know about \<name\>?") with asset-detail chips — input is empty, not pre-filled.
- **Cursor-based pagination on `/api/messages`** (`before=<message_id>&limit=20`) for scroll-back. Both surfaces use an IntersectionObserver sentinel at the top of the message list to trigger `loadMore()` from `useChatSession`. "Loading older messages…" indicator while in flight.
- localStorage cache holds latest 20 messages with 24h TTL; older history fetched via scroll-back does NOT enter localStorage
- Image paste support (Claude vision reads broker app screenshots)
- Changes-only architecture — Claude returns `<changes>` block with only what changed (add/edit/remove)
- Three actions parsed by backend: add (INSERT), edit (UPDATE by name match, case-insensitive, supports `new_name` for renaming), remove (DELETE by name match, case-insensitive)
- **Pure renames are not logged to the diary** (per Decision 2) — when an edit's only diff is the asset name, the asset UPDATE still runs but `mutations` insert is skipped
- Edit mutations propagate user-stated `buy_date` from Claude's `<changes>` block to `mutations.occurred_at`
- Currency on insert: derived from Yahoo's reported currency when symbol is known, else country-mapped for real estate, else EUR default
- Strict topic boundary in system prompt — declines off-topic requests with a fixed redirect
- Rate limit: 50 messages per user per day, enforced atomically via the `rate_limits` table and the `increment_rate_limit` RPC (bucket `chat`); input cap: 500 characters; auto-retry on Claude API failure (3 attempts with backoff)
- Cold-load fallback: `useChatSession` reads localStorage first; on miss or expiry, issues `GET /api/messages?limit=20` and warms the cache
- Files: `src/components/ChatPopup.tsx`, `src/app/chat/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/messages/route.ts`, `src/lib/claude.ts`, `src/lib/use-chat-session.ts`, `src/lib/apply-changes.ts`

### Portfolio Change Validation
- Server-side validation in `src/lib/validations.ts`, invoked from `/api/chat` after JSON parsing and before any database write
- All-or-nothing: if any change in a multi-change turn fails validation, the entire turn is rejected — no partial writes, no mutation rows logged
- Rules: edit with resulting units below zero is blocked; edit with resulting value below zero is blocked; add with non-positive units or negative value is blocked; remove is unconditionally allowed
- Float tolerance of `1e-9` applied to all unit comparisons to absorb floating-point drift on fractional crypto positions
- Error messages use banker's tone: negative-position edits name the asset and describe the attempted sell quantity; no apology language
- On validation failure the error message is saved to the `messages` table as the assistant turn and returned as the API response — Claude is not called again
- Note: there is no public manual-edit path. PATCH/DELETE on `/api/assets/[id]` was removed per Decision 8. Chat is the only modification surface.
- Files: `src/lib/validations.ts`, `src/app/api/chat/route.ts`

### Conversational Onboarding
- Triggers when user has zero assets
- Three-step flow: assets first, anything else, optional soft goal
- "Just keeping track" accepted as valid goal answer
- Mentions screenshot capability during step 1; the stocks class seed message also names all three input modalities ("type it, paste a screenshot, or pick a category below")
- Cash naming guidance: prompts the user for what the money is *for* (Emergency fund, Travel pot) rather than which bank holds it, per Decision 11
- **Next-step nudge**: after onboarding, when the user's portfolio has 1–5 assets all in a single category (e.g. only stocks), `buildDynamicContext` injects a one-sentence instruction telling Claude to suggest complementary asset types (cash, pension, property, etc.) at the natural end of a winding-down turn. Disappears once the user crosses 5 assets or adds a second category.
- Files: `src/lib/claude.ts` (`buildOnboardingPrompt`, `buildDynamicContext`), routed in `src/app/api/chat/route.ts`

### Pilot Analytics
- `@vercel/analytics` — `<Analytics />` in root layout; automatic pageview tracking active
- Four custom events instrumented:
  - `signup` — fired client-side on first page load after OAuth redirect (`?welcome=1` param)
  - `first_asset_added` — fired when a new user (zero assets before the turn) commits their first portfolio add; detected server-side in `/api/chat`, returned as `analyticsEvent` in the JSON response, fired via `track()` in `use-chat-session.ts`
  - `first_chat_mutation` — fired when a user with zero prior mutations commits any portfolio change; same server-to-client flag mechanism
  - `return_visit_day2_plus` — fired client-side on Portfolio mount when `user.created_at` is more than 24 hours ago
- No external dashboard setup required — results appear in Vercel Analytics automatically
- Files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/api/chat/route.ts`, `src/lib/use-chat-session.ts`

### Financial Diary
- Every add/edit/remove via chat creates a row in `mutations` (pure renames excepted)
- Captured fields: action, before_value, after_value, currency, before_units, after_units, asset_type, symbol, personal_context, portfolio_total, occurred_at, recorded_at
- **Notes are immutable** (per Decision 1). `personal_context` is captured at the moment of mutation via Claude's `<context>` block and never edited afterward. No inline editor, no `+ Add note` affordance, no `PATCH /api/mutations/[id]` endpoint.
- **Asset names displayed via JOIN** (per Decision 4). Diary fetch uses `LEFT JOIN assets ON mutations.asset_id = assets.id` and renders `COALESCE(assets.name, mutations.asset_name)`. Live assets get the current name; deleted assets fall back to the name preserved on the mutation row.
- For tradeable mutations (stocks/etf/crypto/gold), display prefers unit-based deltas (`+5 shares`) over value-based deltas. Falls back to signed value delta or context-only for older entries.
- Date format drops the year for current-year entries (`8 May` instead of `8 May 2026`)
- Compact two-line entry layout: icon + name + delta + date on row 1, optional context note (static italic, line-clamped) on row 2
- Real asset logos via AssetLogo (cash/pension wallet, bonds certificate, crypto/stock via proxy, real estate by property type, monogram fallback)
- Action signaling comes from value pattern: positive-text/positive-soft for adds, signed delta for edits, strikethrough for removes
- Filter section: period chip row (`All / 1W / 1M / 3M / 1Y / Custom`). When Custom is selected, the date range picker renders on a sub-row directly below the chips
- Period title shown above filters when a non-`All` period is selected
- AI summary card at top of timeline — pulsing V mark while loading, 3 bullet points + activity counts when loaded
- **Search**: text input above the period filter chips; case-insensitive substring match on the joined display name OR `personal_context`; combines with period filter via AND
- **"Worth knowing" callout**: rendered above the timeline, independent of filters; conditions — `occurred_at` shares today's month and day, is in a prior year, and is at least 30 days ago; oldest match wins; tap clears active filters if needed, smooth-scrolls, plays a 1.5s accent ring highlight
- Files: `src/app/diary/page.tsx`, `src/components/DiaryTab.tsx`, `src/app/api/chat/route.ts`, `src/app/api/diary-summary/route.ts`

### Investor Profile (Self-Building)
- Background Claude call after each non-onboarding conversation extracts lasting facts and a fingerprint sentence
- Stored in `users.profile` (jsonb) and `users.fingerprint` (text)
- Four context fields: `life_and_direction`, `approach`, `currently_exploring`, `worth_raising`
- Field labels render in title case on Profile
- Never overwrites — only adds or refines. Each field capped at 200 chars.
- **Page structure (top to bottom):** User's full name as the 38px serif page title (left-aligned). Fingerprint (15px italic serif) directly beneath the name — hidden when null. Perspective section (see below). Context section (hidden if all four fields empty). Preferences (Display currency, Theme). Email + Sign-out account area at the bottom.
- **Fingerprint**: single italic-serif sentence (12–18 words) generated by the same extraction call. Example: `Long-horizon investor concentrated in semiconductors and residential property.`
- **Context fields are read-only.** Fields with no content are hidden entirely.
- **Perspective** (moved from Vitals, 2026-05-22): NL/EU/world net-worth percentile standing, computed deterministically client-side. `useNetWorth()` supplies the EUR net worth (same formula as Portfolio). `GET /api/snapshots?range=All` provides the baseline for the trajectory chip; chip appears only when a ≥330-day baseline exists. No LLM call.
- **No avatar on Profile.** `users.avatar_url` remains in the schema, is still written at Google OAuth signup, and is still returned by `GET /api/users/me`, but no UI surface renders it. It was removed from the PATCH allowlist and `src/lib/avatar-upload.ts` was deleted in the account-deletion cleanup batch.
- Profile page also hosts the Preferences section (Display currency, Theme) as collapsible rows
- Email is shown in the account area at the bottom, next to Sign out
- Files: `src/lib/profile-extractor.ts`, `src/app/profile/page.tsx`, `src/app/api/users/me/route.ts`, `src/components/perspective/PerspectiveCard.tsx`, `src/lib/hooks/netWorth.ts`

### Vitals
- Seven portfolio vitals on `/vitals`: Concentration, Real-asset weight, Liquidity posture, Leverage, Drawdown vulnerability, Cash & real yield, Real growth. Each user sees only the vitals that apply to their portfolio; the rest sit dormant in the Library expander.
- Pulse sentence (LLM, Haiku, 24h cache) synthesises the active vitals in one line.
- **Property pill toggle (2026-05-22).** Shown only for mixed portfolios (real estate + investable assets). Off hides `scope = 'house'` vitals (Real-asset weight, Leverage) to the Library and switches Concentration card TOP 1 to investable figures. Default adaptive: `grossProperty / grossAssets ≥ 50%` → on. Persisted in sessionStorage. No mutations, no schema change.
- **Equity / net-worth basis consistency (2026-06).** The Concentration card is fully equity-based: the headline, top-3, AND the per-position bar all divide property at equity (`value − computeCurrentBalance`) over equity net worth — matching the allocation donut and the Portfolio hero (previously the bar used a gross/gross basis and read ~63% where the headline read ~52%). The Vitals API path EUR-normalizes `mortgage_balance` and `monthly_payment` alongside `value` so equity is computed entirely in EUR for non-EUR property, and `computeNetWorth` uses the amortized balance (`computeCurrentBalance`) so Vitals net worth equals the Portfolio hero by construction.
- **Ordinals & sign-aware pill (2026-06).** Ranks/percentiles render correct ordinal suffixes (`ordinalSuffix` in `utils.ts`: 41st, 93rd, 22nd, with 11th/12th/13th kept "th") for the EU rank and all three Perspective percentiles. The Perspective change pill's word and arrow follow the sign — "Up N" (up arrow) / "Down N" (down arrow, magnitude only) / "No change" (flat) — no more "Up -9".
- Read-only surface; all modifications through Chat.
- Files: `src/app/vitals/page.tsx`, `src/lib/vitals/` (index, types, 7 modules), `src/components/vitals/`, `src/app/api/vitals/route.ts`, `src/lib/pulse-generator.ts`, `src/lib/hooks/vitals.ts`

### Design System
- **Tokens**: CSS variables in `src/app/globals.css` (light theme on `:root, [data-theme="light"]`; dark theme on `[data-theme="dark"]`), surfaced as Tailwind utilities via `tailwind.config.ts`, mirrored as TypeScript exports in `src/lib/tokens.ts`
- **Fonts**: Source Serif 4 (serif, hero numbers + section titles), Albert Sans (body), Geist Mono (retained but used sparingly — only for the few elements where tabular precision really matters; otherwise `font-feature-settings: "tnum" 1` on `body` gives Albert Sans tabular numbers)
- **Palette**: cream (`#F5F1EA`) + ink primary in light mode; warm-black + cream in dark mode. Single accent: green (`#4A7C5E`). Semantic tokens for positive/negative (positive-soft, positive-text, negative-soft, negative-text). Holdings categories use additional semantic tokens (`--category-public-markets`, `--category-reserves`) for the blue and brown bars on group headers.
- **Hero treatment**: editorial dimmed currency prefix (e.g., dimmer `€` next to bright digits) is intentional styling, not a CSS bug
- **Mockups** are the literal source of truth for visual presentation — the frozen redesign HTML artefacts (portfolio, diary, chat, profile, and the per-type detail pages) kept in project knowledge, not committed to the repo. The one mockup that does live in the repo is `docs/vitals-mockup.html` (the Vitals tab).
- Bottom nav icons extracted directly from the mockup HTML; 24x24px box, stroke-width 10 on viewBox 256 for inactive, `fill="currentColor"` for active Portfolio (deliberate downsize from mockup's 26x26 / stroke-14 because the active fill reads chunkier in actual use than in static preview — see PR 21)
- NavBar renders first name only (no avatar). `users.avatar_url` exists in the schema but is not rendered anywhere in the current app.

---

## Known Bugs and Risks

- **CBS OData constants are the single live-verify point** — the indicative-value engine depends on the legacy CBS endpoint, the measure key (`PrijsindexVerkoopprijzen_1`), the stripped-title RegioS match (keys carry trailing spaces, e.g. `"PV30  "`), and the yearly `JJ` period format. If CBS renames the table/measure or changes the endpoint, estimates degrade to `{ available: false }` (never an error). Verify against the live service on device; `?debug=1` surfaces the first failing step. NL-only by design.
- **Trend cards depend on a clean snapshot history** — Vitals trend/baseline cards (Real growth, the Perspective trajectory chip) read `snapshots`; a sparse or backfilled history can make them read oddly until a clean ≥330-day baseline accumulates. Not a correctness bug in the metric.
- **Multiple lockfiles warning** in Next.js — cosmetic
- **Token usage grows with portfolio size** — at 50+ assets the system prompt gets large; no compression layer
- **No retry on Yahoo Finance failures** — if Yahoo is down, prices show as offline (acceptable, not gracefully handled)
- **Historical mutations have currency-implicit-EUR values** — rows logged before the native-storage migration have `before_value` and `after_value` stored as EUR-equivalent even when the position was non-EUR priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP; post-migration rows are correct (native currency).
- **Two-write atomicity** — asset update + mutation insert is not transactional. If the asset write succeeds and the mutation write fails, the diary skips an entry. Sentry captures the failure. Acceptable for MVP.
- **Money input round-trip rounding** — historical concern, less relevant now that all input flows have moved to chat (chat doesn't echo a typed-display-currency value back)
- **Goal targets drift with FX** — goal `target_value` is stored in EUR at the rate active when set. As FX drifts, a user who set a $1,000,000 goal may see the displayed target shift slightly. Economic intent preserved.
- **Diary banker's notes render in the currency they were written in** — `personal_context` strings in `mutations` are rendered as stored. Switching display currency does not retroactively rewrite old entries.
- **Safari OAuth on localhost** — Google sign-in on localhost via Safari redirects to production due to Safari + ITP third-party cookie blocking. Not blocking; works in Chrome and other browsers; production unaffected.
- **AAPL logo intermittently 404s from FMP** — when FMP doesn't return the AAPL image, AssetLogo falls back to monogram. Acceptable; affects display only.
- **Profile fingerprint may be null** for new users or after a recent reset of `users.fingerprint`; the section above the Context card hides cleanly when null. If the extractor never populates a value for an active user, that's a separate diagnosis (check Sentry for failed extraction calls).
