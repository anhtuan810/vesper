# Technical Decisions

## Frontend Stack

- **Next.js 16** (Turbopack) with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Fonts**: Source Serif 4 (serif, hero numbers + section titles), Albert Sans (body, with `font-feature-settings: "tnum" 1` on `body` for tabular numbers), Geist Mono (retained but used sparingly — only the few elements where tabular precision really matters). All loaded from Google Fonts.
- **Design tokens** in `src/app/globals.css` (CSS vars on `:root, [data-theme="light"]` and `[data-theme="dark"]`) + `tailwind.config.ts` (utilities) + `src/lib/tokens.ts` (TypeScript mirror for inline JS contexts)
- **Theme system**: two modes — `light`, `dark`. `auto` is not supported: the DB check constraint still lists it for backward compatibility, but `PATCH /api/users/me` rejects `theme=auto` with 400 and the Profile picker only shows light/dark. Active theme applied via `data-theme="light"` or `data-theme="dark"` on the document root by `ThemeProvider`. Cookie (`volnar.theme`) read in the root layout for SSR to avoid flash. `useTheme()` hook reads `users.theme`, `setTheme()` writes the cookie and PATCHes `users.theme`.
- No state management library — local React state and custom hooks only
- No component library — custom styles using Tailwind utility classes

## Backend / Database Stack

- **Supabase Postgres** with Row Level Security on all user-scoped tables
- **Supabase Auth** for Google OAuth + email magic link
- **Supabase Storage**: two buckets
  - `property-photos` — caches map snapshots keyed by `<user_id>/<asset_id>-<theme>.png` (one per theme variant). RLS: users read/write under their own `user_id` prefix.
  - `user-avatars` — user-uploaded avatars (added in the migration alongside Decision 6). RLS: users read/write under their own `user_id` prefix; public-read for display.
- **Next.js API routes** for server-side logic. Active set:
  - `/api/chat` — Claude assistant + portfolio mutations + snapshot trigger
  - `/api/messages` — chat history fetch with cursor pagination (`before=<id>&limit=20`)
  - `/api/prices`, `/api/prices/history`, `/api/prices/history/batch`
  - `/api/fx`
  - `/api/geocode`
  - `/api/diary-summary`
  - `/api/snapshots`, `/api/cron/snapshot`, `/api/cron/market-highlights`
  - `/api/insight` — AI insight band (new in the migration)
  - `/api/dashboard-init` — batched GET returning `{ insight, snapshots (1M), mutations }` in one auth round-trip; used by the Portfolio page on mount
  - `/api/vitals`, `/api/vitals/pulse` — deterministic Vitals body + the Haiku Pulse sentence (cached in `highlights`)
  - `/api/scenarios` (+ `/api/scenarios/[id]`, `/compute`, `/counterfactual`, `/project`) — scenario engine (GET list/POST save + compute endpoints)
  - `/api/property-estimate` — indicative NL property value (CBS PBK)
  - `/api/assets` — POST only, undo-restore of a just-deleted asset (logs a "Restored after delete" mutation)
  - `/api/mutations` — GET the user's recent mutations
  - `/api/users/me` — GET user preferences (`name, avatar_url, display_currency, theme, fingerprint, profile`); PATCH to update preferences (theme, display_currency, profile)
  - `DELETE /api/users/me` — permanent account deletion; explicit per-table delete loop over the user-scoped tables (`messages, highlights, goals, snapshots, mutations, assets, diary_summaries, vital_snapshots, scenarios`, all keyed by `user_id`), then the `users` row, then the auth user. `rate_limits` relies on its `ON DELETE CASCADE`; `fx_rates` is global and untouched
  - `/api/logo` — server-side logo proxy
  - `/api/backfill` — per-user, session-authenticated (`getAuthUser`) price backfill plus a `rename-tickers` job; rate-limited to once per 30 days per user. Client-invoked, not cron.
- **Routes removed in the migration**: `PATCH /api/assets/[id]` and `DELETE /api/assets/[id]` (Decision 8, PR 4); `PATCH /api/mutations/[id]` (Decision 1, PR 5). All asset and diary modifications now flow through `/api/chat`.
- **Anthropic Claude API** called server-side only (API key never exposed to client)
- **Sentry** for error tracking (server, client, edge). Free tier covers MVP scale. App runs gracefully when DSN is unset.
- **frankfurter.app** for FX rates (no key, ECB-backed)
- **OpenFreeMap** for property maps (no key, MIT-licensed) via MapLibre GL JS. Two styles: `src/styles/map-light.json` and `src/styles/map-dark.json`.
- **OSM Nominatim** for geocoding (free, rate-limited at 1 req/sec, requires User-Agent header) — only called server-side from `/api/chat` when a real-estate position is added
- **Vercel Cron** for scheduled jobs (free tier covers one daily job)
- No separate backend server — all server logic lives in Next.js API routes

## Supabase Project

- Project ID: `cbcpzftelyqgmbawbrpo`
- Region: EU West (Ireland)
- URL: `https://cbcpzftelyqgmbawbrpo.supabase.co`

## Supabase Tables

### users
Auto-populated on signup via Supabase Auth trigger.
- `id` (uuid, PK, references auth.users)
- `email`, `name`, `avatar_url` (now user-editable via tap-to-upload on Profile; defaults to Google profile photo on OAuth signup)
- `profile` (jsonb) — four investor profile fields built by `profile-extractor.ts`: `life_and_direction`, `approach`, `currently_exploring`, `worth_raising`
- `fingerprint` (text, nullable) — single italic-serif sentence (12–18 words) generated by the same extraction call; rendered on Profile below the user's name. Added in PR 7.
- `display_currency` (text, default `'EUR'`, check `in ('EUR', 'USD', 'GBP')`)
- `theme` (text, default `'auto'`, check `in ('auto', 'light', 'dark')`) — DB constraint still lists `auto` for backward compatibility; API only accepts `light` or `dark`
- `created_at`, `updated_at`

### assets
Core portfolio table. One row per position.
- `id` (uuid, PK), `user_id` (uuid, FK)
- `name`, `type` (stocks | etf | crypto | bonds | gold | real_estate | cash | pension | other)
- `value` (numeric) — stored in the asset's **native** currency. No conversion at write. USD is the bridge for aggregation only (in snapshots, mutations.portfolio_total, and net-worth math). EUR and GBP are display-only at render time.
- `currency` (ISO code) — the asset's **native** currency (Yahoo-reported for tradeables; country-derived for real estate; user-stated for cash/pension/bonds/other).
- `country` (ISO2), `symbol` (Yahoo Finance ticker), `units`, `buy_price`, `buy_date`, `buy_price_source`
- Real estate fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type`, `mortgage_start_date`, `mortgage_end_date`, `mortgage_balance_recorded_at` (timestamptz — the anchor date for `mortgage_balance`, set on every write that touches mortgage_balance; used by `computeCurrentBalance()` to project the current balance forward; added in PR 8)
- Property fields: `address`, `latitude`, `longitude`, `photo_url` (now only holds the cached map PNG URL; user photo upload was removed per Decision 9), `property_type`, `size_sqm`
- Bond fields: `coupon_rate`, `maturity_date`, `issuer`, `isin`
- Pension fields (migration `20260610_pension_two_shape.sql`, idempotent): `pension_kind` (text, nullable; CHECK constraint `pension_kind_valid` allows NULL or `'dc' | 'db' | 'state'`; legacy pension rows backfilled to `'dc'`), `annual_income` (numeric — income pensions), `monthly_contribution` (numeric — capital pensions), `access_age` (int), `pension_provider` (text). Capital (`dc`) pensions reuse `value` (the pot) and `mortgage_rate` (the static-asset interest-rate convention, here the % growth assumption) and `currency`; income (`db`/`state`) pensions leave `value` NULL.
- `created_at`, `updated_at`

### messages
Chat history. Read by `/api/chat` to build conversation context (last 6 messages). Read by `/api/messages` with cursor pagination for the infinite-scroll chat thread.
- `id`, `user_id`, `role` (user | assistant), `content`, `created_at`

### mutations
Financial diary. Every portfolio change (other than pure renames) creates a row.
- `id`, `user_id`, `asset_id` (nullable for deleted assets), `asset_name`, `asset_type`, `symbol`
- `action` (add | edit | remove)
- `before_value`, `after_value` (numeric, in `currency` — the asset's native currency at the time of the change)
- `before_units`, `after_units` (numeric, nullable — tradeable mutations only)
- `currency` (text, nullable; backfilled from `assets.currency` via `asset_id`, defaulted to `'EUR'` for orphans)
- `personal_context` (extracted from Claude's `<context>` block at the moment of mutation; **write-once** — never edited after, per Decision 1)
- `market_context` (currently unused)
- `portfolio_total` (snapshot of net worth at time of change)
- `occurred_at`, `recorded_at`

### fx_rates
FX rate cache. One row per currency pair. **USD is the base** — values are "1 USD = N quote currency" (e.g. `EUR: 0.89`). 24h TTL, refreshed lazily from frankfurter.app (`?base=USD`). In-process memo cache with 1-minute TTL. `toUsd(amount, currency)` = `amount / rate[currency]`.

### snapshots
Daily net worth records.
- `id`, `user_id`, `total_value` (numeric, **USD** — net worth, not gross; assets converted via `getUsdRates()` at write time), `breakdown` (jsonb keyed by asset type, gross value per type), `date` (date)
- Unique index on `(user_id, date)` enforces one row per user per day
- Written by daily Vercel cron at midnight UTC + fire-and-forget after every successful mutation in `/api/chat`
- Shared writer: `src/lib/snapshot.ts` `writeSnapshot(userId)`
- Served by `GET /api/snapshots?range=<range>`. Supported ranges: `1W` (7d), `1M` (30d), `3M` (90d), `1Y` (365d), `3Y` (1095d), `All` (no cutoff). The `1D` range is not used by the net worth chart (it remains only in the `PriceChart` for tradeable assets).
- Net worth chart uses straight-line segments (`L` path commands) connecting each snapshot point exactly. No smoothing.

### goals
Optional soft goals captured during onboarding.

### highlights
Now actively used as the cache for the AI insight band. `type='insight'`, `detail=<sentence>`, `expires_at = now() + 24h`. The `/api/insight` route reads the latest non-expired row for the user; on miss, generates via Haiku and INSERTs. On Claude failure, returns `{ detail: null }` without inserting.

### date_context
Schema only. Reserved for future server-side anniversary logic. The current "Worth knowing" callout in `/diary` derives matches from `mutations.occurred_at` directly.

### rate_limits
Atomic per-user rate limiting (migration `20260508_rate_limits.sql`).
- `user_id` (FK → users, ON DELETE CASCADE), `bucket` (text), `date` (date), `count` (int). PK `(user_id, bucket, date)`.
- `increment_rate_limit(p_user_id, p_bucket, p_date)` RPC upserts and returns the new count.
- Buckets: `chat` (50/day, `/api/chat`), `diary` (100/day, `/api/diary-summary`). Replaced the prior non-atomic count-then-check.

### price_index_cache
Regional CBS PBK index-series cache (migration `20260606_price_index_cache.sql`). **Region-keyed, NOT user-keyed** — shared across all users and intentionally untouched by account deletion.
- `region_code text PRIMARY KEY`, `points jsonb` (yearly `{year, index}` series), `as_of_period text`, `fetched_at timestamptz`.
- Written only via the service role by `/api/property-estimate`; refreshed when `fetched_at` is older than ~30 days. Reads/writes are best-effort — a missing row degrades to a live CBS fetch.
- Replaced the dropped `woz_cache` table (the WOZ integration was removed entirely).

## Cron Jobs

Configured in `vercel.json`:
- Daily at `0 0 * * *` (midnight UTC) → `/api/cron/snapshot`
- Authenticated via `CRON_SECRET` env var. Route checks `Authorization: Bearer ${CRON_SECRET}` and returns 401 otherwise.

## User Preferences Endpoint

`GET /api/users/me` — returns `{ name, avatar_url, display_currency, theme, fingerprint, profile }` for the authenticated user. `Cache-Control: private, max-age=300, stale-while-revalidate=1800`. Added alongside the HTTP caching work as the foundation for loading user preferences in `UserProvider`.

`PATCH /api/users/me` — the only public write path for `users` columns. Strict field allowlist: `{ display_currency, theme, profile }`. Any other field in the body is rejected with 400. `profile` patches are merged (not replaced) — pass `null` or `""` for a field to remove it. Added in PR 1; absorbed avatar updates (PR 7) and theme updates (PR 1). The defunct `/settings` route was removed per Decision 5 — preferences live on Profile.

## AI / Claude Integration Approach

- **Models**: `claude-sonnet-4-6` for the main assistant; `claude-haiku-4-5-20251001` for diary summary, profile extraction, and the AI insight band
- **Max tokens**: 2000 for main assistant, 160 for diary summary, 500 for profile extraction, ~80 for insight band
- **System prompt** built fresh per request in `src/lib/claude.ts` from current portfolio state, profile, and recent mutations
- **Two prompt variants**: `buildOnboardingPrompt` (zero assets) and `buildSystemPrompt` (existing portfolio)
- **Conversation history**: last 6 messages from `messages` table, with `<changes>` / `<context>` / `<goal>` tags stripped before being passed to Claude
- **Image input**: base64 passed through as a content block when user pastes a screenshot
- **Currency in prompt**: parameterized with `displayCurrency`. Prose totals render in display currency; `<changes>` JSON stays native. `<context>` banker's notes are written in display currency. Goal targets stated in display currency are converted to USD via FX rates before INSERT.
- **`<context>` instruction**: bans scaffolding language ("auto-filled", "live data", "Yahoo Finance"). Frames the context as a private banker's ledger note.
- **Renaming support**: edit action accepts a `new_name` field. Pure renames (when the only diff is the name) update the asset row but skip the `mutations` insert — see Mutation Logging Rules below.

### Chat surface architecture (post-Decision 3)
Chat is a single continuous thread per user. No "new chat" / "clear history" / "session list" affordances anywhere in the UI. `useChatSession`'s 24h localStorage TTL is a cache strategy, not a UX session boundary. `/api/messages` supports cursor-based pagination (`before=<message_id>&limit=20`) for scroll-back; both mobile and desktop chat surfaces use an IntersectionObserver sentinel to trigger lazy loading at the top of the message list.

### Changes-only architecture
Claude returns small `<changes>` blocks — only what changed, never the full portfolio. Three actions:
- `add` → INSERT into assets (with currency derived from Yahoo when symbol is known, else country-mapped for real estate, else EUR default)
- `edit` → UPDATE matched by name (case-insensitive). Supports `new_name` for renaming.
- `remove` → DELETE matched by name (case-insensitive)

Server-side validation in `src/lib/validations.ts` runs before any DB write. All-or-nothing: any negative-unit or negative-value result rejects the full turn with a banker's-tone error saved as the assistant reply.

### Background profile extraction
After every non-onboarding chat, a separate Haiku call analyzes the exchange and updates `users.profile` and `users.fingerprint`. Fire-and-forget — never blocks the user response. The extractor emits four context fields (`life_and_direction`, `approach`, `currently_exploring`, `worth_raising`) plus a single-sentence fingerprint. Costs ~$0.003 per conversation.

### AI insight band
After portfolio events, `/api/insight` may regenerate a single italic-serif "WORTH KNOWING" sentence, cached 24h (server-side DB `expires_at`) in the `highlights` table. The client-side in-memory cache (`useInsight` via `INSIGHT_CACHE_TTL_MS`) has a 1-hour TTL.

**Thin-portfolio path** (≤3 assets): `generateInsight` returns deterministic copy — names the held positions and highlights common absent categories — without calling Claude Haiku. Zero LLM cost.

**Standard path** (4+ assets): calls Claude Haiku (~80 tokens). The LLM marks the key noun phrase with `*asterisks*`; the frontend wraps that span in `<em>`. On failure the route returns `{ detail: null }` and does not INSERT. Cost: ~$0.0001–0.0003 per call.

### Strict topic boundary
System prompt tells Claude to refuse off-topic requests with a fixed redirect message.

## Indicative Property Value — CBS PBK over WOZ (2026-06)

**Decision:** replace the dead WOZ integration with a **deterministic, server-side indicative value** built on the CBS *Prijsindex Bestaande Koopwoningen* (PBK). WOZ code is removed and `woz_cache` is dropped.

**Rationale:** WOZ requires per-municipality scraping/lookups with no stable free API and lags ~1–2 years; the CBS PBK is a single free official OData series, base 2020 = 100, from 1995, regionally broken down — enough for an *indicative* (not appraisal) value with one well-defined source.

**Method (no LLM):** `currentValue = buy_price × (index_now / index_buyYear)`. The figure is computed server-side and is server-authoritative — the model never produces it. Purchases before 1995 clamp to the 1995 baseline (`clamped`). Output is always wrapped so it never throws — any miss returns `{ available: false }`.

**Region:** address → gemeente + province via PDOK Locatieserver; index region is the province, or the city for the G4 (Amsterdam, Rotterdam, 's-Gravenhage, Utrecht). **NL-only.**

**The single live-verify point (`src/lib/cbs-pbk.ts`):**
- Source = legacy OData base `https://opendata.cbs.nl/ODataApi/odata/85792NED` (the v4 `datasets.cbs.nl` base 404s for this table; kept only as an inert fallback).
- RegioS matched by **stripping the trailing group marker** from the Title (`"Noord-Brabant (PV)"` → `"Noord-Brabant"`) and using the **Key exactly as returned, with trailing spaces** (e.g. `"PV30  "`) in the TypedDataSet filter.
- Measure = the one titled `Prijsindex verkoopprijzen` with a **non-empty key** (`PrijsindexVerkoopprijzen_1`), never the empty-key group header `Prijsindex bestaande koopwoningen`.
- Periods are yearly `{YYYY}JJ00`.
- A gated `?debug=1` (`diagnoseRegionIndex`) surfaces the intermediate resolution and first-failing step. Verify against the live CBS service on device.

**Caching:** per-region series in `price_index_cache` (see Supabase Tables), shared across users, ~30-day TTL.

**Files:** `src/lib/cbs-pbk.ts`, `src/lib/property-estimate.ts`, `src/lib/property-region.ts`, `src/lib/property-estimate-resolve.ts`, `src/app/api/property-estimate/route.ts`, `src/components/asset-detail/EstimatedValueChart.tsx`.

## Portfolio Calculation Rules

- **Gross total** = sum of `toUsdClient(asset.value, asset.currency)` for all assets
- **Net worth** = sum where real estate assets contribute `(value − computeCurrentBalance(asset))` instead of value. **Every read site goes through `computeCurrentBalance` rather than reading `assets.mortgage_balance` directly** (see Mortgage Auto-Amortization below). Result converted to USD for aggregation. As of 2026-06 the shared `computeNetWorth` helper (`src/lib/utils.ts`) also uses `computeCurrentBalance` (the **amortized** balance) instead of the raw `mortgage_balance`, so the Vitals net worth (`build-inputs.ts`) equals the Portfolio hero by construction and stays equal as the loan amortizes. It degrades to the stored balance when the amortization fields are absent (the two mutation-snapshot callers carry only `mortgage_balance`, so their behaviour is unchanged).
- **Equity per real estate asset** = `value − computeCurrentBalance(asset)` (in native currency). **Equity-everywhere basis:** the Portfolio hero/holdings, the allocation donut, the Vitals net worth, and the **full** Concentration card (headline, top-3, AND per-position bar) all use this equity basis over equity net worth. The Vitals input path (`build-inputs.ts`) EUR-normalizes `mortgage_balance` and `monthly_payment` alongside `value` so equity is computed entirely in EUR for non-EUR property.
- **Allocation percentages** calculated against gross total (USD)
- **Income pensions are off-balance.** `isIncomePension` assets (`pension_kind` `db` | `state`) are filtered out **before any value math** in `computeNetWorth` (`src/lib/utils.ts`), the gross total, the allocation, and the holdings groups — they never reach a total. Capital pensions (`dc` / null) are unchanged. Second line of defence: an income pension's `value` is NULL and `toUsdClient(null) → 0`, so even an unfiltered sum cannot inflate. The five aggregating Vitals modules apply the same `isIncomePension` filter (see `vitals-metrics-reference.md`).
- **Holdings grouping** (PR 14, updated PR 23): positions grouped into four groups — Property (`real_estate`), Public markets (`stocks` / `etf`), Reserves (`cash` / `pension` / `bonds` / `gold` / `other`), Crypto (`crypto`). Gold and bonds remain in Reserves. Group order by total value descending. All collapsed by default, tap to expand, session-persisted. Income pensions are excluded from all four groups and surfaced in a separate off-balance "Future income" section in `PortfolioTab`; capital pensions stay in Reserves.

## Pension Two-Shape Model (2026-06)

One asset class (`type='pension'`), two economic shapes selected by `pension_kind`. New nullable columns on `assets`: `pension_kind` (`'dc' | 'db' | 'state'`, CHECK `pension_kind_valid`), `annual_income`, `monthly_contribution`, `access_age`, `pension_provider`; capital pensions reuse `value` (pot), `mortgage_rate` (growth %), and `currency`. Legacy pensions backfilled to `'dc'`.

- **Shape mapping** (`src/lib/pension.ts` `pensionShape`): `dc → capital`; `db | state → income`; `null → capital` (defensive, for legacy rows). `isCapitalPension` / `isIncomePension` are the call-site guards. Capital counts toward net worth; income is off-balance (see Portfolio Calculation Rules).
- **Capital projection is deterministic** (`projectPension`): monthly-compounded future value of pot + contributions — `fvPot = potValue·(1+r)^years`, `fvContrib = i>0 ? monthly·((1+i)^m − 1)/i : monthly·m`, with `r = growthRatePct/100`, `i = r/12`, `m = round(years·12)`. All outputs `Math.round`ed integers; guards return the pot value when `yearsToAccess ≤ 0` and the linear sum when `i = 0` (no NaN/Infinity). **The LLM never computes it.** Inputs include the user's current age derived from `users.birth_year` (`currentYear − birth_year`) via `yearsToAccess(access_age, currentAge)`; the projection card hides entirely if any input is missing or `yearsToAccess ≤ 0`.
- **Intake gate is deterministic** (`validatePensionChange` in `src/lib/pension-intake.ts`): required, chips-first, type-first; no skips and no silent defaults (growth and access age must be chosen by the user). A mandatory confirmation echo gates the commit; the gate is enforced in both the echo (`proposal-resolver.ts`) and the write path (`apply-changes.ts`), so an incomplete pension can never be saved. Every confirmed add and edit writes a `mutations` row; the pension activity verb is "Added"/"Recorded" (income amounts "€X / year"), never "Bought".
- **Deferred by design**: indexation is not captured (income page shows "Not captured"); no in-payment transition; a DB entitlement is never capitalized into net worth.

## Mortgage Auto-Amortization

Added in PR 8 per Decision 10. The user enters mortgage values once. After that, the displayed balance decreases automatically based on the amortization formula — silently, with no UI affordance and no diary entry per month.

- `computeCurrentBalance(asset, asOf = today)` in `src/lib/mortgage.ts` projects forward from `mortgage_balance` at `mortgage_balance_recorded_at` to today using the mortgage type (annuity / linear / interest_only).
- Every read site goes through the helper: net worth math, equity hero, `ValueComposition`, `MortgageBlock` stat tiles, payoff projection TODAY marker, Claude's portfolio context.
- `assets.mortgage_balance` is the **anchor** value at `mortgage_balance_recorded_at`, not today's value. Both columns are written together whenever a mortgage balance changes (initial setup, extra payment via chat, refinance).
- Interest-only mortgages stay flat; `mortgage_free_date` returns `—`.
- Notable events (extra payment, refinance, rate change, value update) are logged via chat. Monthly amortization is never logged.

## Currency Rules

- **Storage**: `assets.value` is stored in the asset's **native currency** (Yahoo-reported for tradeables; country-derived for real estate). No conversion at write.
- **FX bridge**: USD. `fx_rates` stores "1 USD = N quote" (e.g. `EUR: 0.89`). `toUsd(amount, currency)` = `amount / rate[currency]`. `toUsdClient(amount, currency)` is the synchronous client-side equivalent (precise for EUR and GBP; other currencies fall back to 1:1).
- **Aggregation**: `snapshots.total_value` and `mutations.portfolio_total` are stored in USD. Net-worth math goes `native → USD` via `getUsdRates()`.
- **Display**: per-user via `users.display_currency` (EUR / USD / GBP). `formatMoney(nativeValue, nativeCurrency, displayCurrency)` = `toUsdClient(amount, from) / getUsdRate(displayCurrency)`.
- **Number formatting is forced to `nl-NL` locale** for all currencies regardless of user locale — `€616.086`, `$616.086`, `£616.086` (dot thousand separator, comma decimal). Deliberate brand-consistency override.
- **Inputs**: chat is the only modification surface. Chat prompts are parameterized with `displayCurrency`; goal targets are converted from display currency to USD via FX rates before INSERT.
- **Real estate native currency**: captured at add time via `countryToCurrency()` in `src/lib/country-currency.ts` (NL/DE/FR/ES/IT→EUR, US→USD, UK→GBP, other→EUR).
- **Math**: never in display currency. USD for aggregation; native for per-asset arithmetic.

## Snapshot Calculation Rules

- `total_value` = net worth in **USD** (real estate contributes equity via `computeCurrentBalance`; each asset value converted from native via `getUsdRates()`)
- `breakdown` = jsonb keyed by asset type, summing gross `value` per type (USD)
- Computed in `src/lib/snapshot.ts` from current asset state at write time

## Mutation / Diary Logging Rules

- Every `add`, `edit`, `remove` action in `/api/chat` writes a row to `mutations` **with one exception**: pure renames (an edit where the only diff is the asset name) update the asset row but skip the `mutations` insert (Decision 2, PR 5).
- **There is no public manual-edit path.** `PATCH /api/assets/[id]` and `DELETE /api/assets/[id]` were removed per Decision 8 (PR 4). Chat is the only modification surface.
- `add` actions are dedup-checked before INSERT: case-insensitive symbol match if symbol present, else case-insensitive name match. Duplicates surfaced conversationally.
- `currency` recorded alongside the value — the asset's native currency at write time. `before_value` and `after_value` are in this native currency.
- `before_units` / `after_units` recorded for tradeable mutations only. Diary display prefers unit-based deltas when populated.
- `personal_context` is **write-once** — captured from Claude's `<context>` block at the moment of mutation, never edited afterward (Decision 1). The corresponding PATCH endpoint was deleted.
- `portfolio_total` captured at the moment of mutation.
- `occurred_at` defaults to today; Claude uses `buy_date` for adds when known, and propagates user-stated dates from `<changes>` to `mutations.occurred_at` on edits as well.
- **Diary display reads asset names from the current `assets.name` via LEFT JOIN** (Decision 4, PR 5). `mutations.asset_name` is the fallback for deleted assets only. Same join applies in `/api/diary-summary` and the diary search predicate.

## Price Fetching and Currency Conversion

- Server-side proxy at `/api/prices`, batches all symbols in one request to Yahoo Finance v8 chart endpoint
- **No conversion in the price pipeline.** Returns native Yahoo prices with GBp→GBP normalisation only.
- `PriceResult`: `{ symbol, price (native), previousClose (native), nativePrice, nativeCurrency, requested_symbol? }`
- `requested_symbol` is set by `fetchPriceWithFallback` — when a bare ticker was resolved to a venue-qualified one (e.g. ZPRR → ZPRR.DE), callers can detect the rewrite.
- Venue fallback: bare symbols fan out to `venuePriorityFor(country)` suffixes via `Promise.allSettled`; first success in priority order wins.
- 5-minute in-process price cache per symbol; 1-minute in-process FX memo cache; 24h `fx_rates` DB TTL
- FX resolution order: in-process memo → DB cache (within 24h) → frankfurter.app live fetch → hardcoded fallback rates
- Self-heal (in `useAssets`): when `nativeCurrency !== assets.currency` or `p.symbol !== assets.symbol`, writes `{ value, currency?, symbol? }` back to Supabase with `value = Math.round(p.price * asset.units)` (native)
- `normalizePrice()` in `src/lib/prices.ts` handles Yahoo's GBp → GBP penny quirk
- `liveAssets` memo in `useAssets` overlays `value = price × units` (native) and `currency = nativeCurrency` onto each asset. All display math uses these overlaid values.

## Asset Logo Resolution

- Shared `AssetLogo` component handles logo rendering across DiaryTab and PositionRow
- Resolution order:
  1. **Cash / pension** → inline SVG wallet icon (purpose-pot framing per Decision 11; no Clearbit lookup)
  2. **Bonds** → inline SVG certificate icon
  3. **Real estate** → inline SVG icons by `property_type`
  4. **Crypto** → `/api/logo?type=crypto&symbol={base}` proxy (server fetches from jsdelivr cryptocurrency-icons)
  5. **Stocks/ETFs** → `/api/logo?type=stock&symbol={symbol}` proxy (server fetches from Financial Modeling Prep)
  6. **Fallback** (gold, other, or any image error) → colored monogram badge
- `/api/logo` validates `type` (`crypto` or `stock`) and `symbol` (regex `/^[A-Za-z0-9.\-]+$/`, max 16 chars). 5-second AbortController timeout. On non-2xx or timeout, returns 404; client falls back to monogram.
- In-process cache: `Map` at module scope, 7-day TTL, FIFO eviction at 500 entries. `Cache-Control: public, max-age=604800, immutable` on every response — CDN sees Vercel's edge IP, not the user's.

## Property Map

`PropertyMap` (MapLibre GL JS on OpenFreeMap tiles) is the sole real-estate visual per Decision 9 (PR 8). Photo upload removed entirely.
- Theme-aware via `useTheme()`: `src/styles/map-light.json` and `src/styles/map-dark.json`
- After first render, captures the canvas as PNG and uploads to Supabase Storage at `property-photos/<user_id>/<asset_id>-<theme>.png`
- Subsequent loads serve the cached PNG per theme; on miss, falls back to live render
- Accent green pin overlaid on map
- "Open in Maps" deep-link affordance pillbox

## Authentication

- Supabase Auth handles sessions via secure cookies
- `middleware.ts` checks the session on every protected route and redirects to `/login`
- The `users` table is auto-populated by a Supabase trigger on `auth.users` insert
- Service role key used server-side; anon key used client-side (RLS enforces user scope)
- Site URL: `https://app.volnar.nl`. Redirect URLs: `http://localhost:3000/**`, `https://app.volnar.nl/**` (wildcards cover all auth routes including `/auth/callback` and `/auth/confirm`).
- Safari OAuth on localhost is broken due to ITP third-party cookie blocking — works in Chrome and other browsers; production unaffected.

## HTTP Cache-Control Headers

All user-scoped API routes use `private` — never CDN-shared. Error responses (4xx/5xx) do not receive cache headers.

| Route | Handler | max-age | stale-while-revalidate |
|---|---|---|---|
| `/api/prices` | GET | 60s | 300s |
| `/api/fx` | GET | 3600s | 86400s |
| `/api/snapshots` | GET | 300s | 1800s |
| `/api/insight` | GET | 3600s | 86400s |
| `/api/dashboard-init` | GET | 30s | 300s |
| `/api/users/me` | GET | 300s | 1800s |

Write paths (`/api/chat`, `PATCH /api/users/me`, `POST /api/assets`) carry no cache headers.

`/api/users/me` GET was added alongside the cache header work. It returns `{ name, avatar_url, display_currency, theme, fingerprint, profile }` and is the foundation for loading user preferences in `UserProvider` (Step 6).

## Client-Side Caching (sessionStorage)

Assets are cached in `sessionStorage` under the key `volnar.assets.<userId>` for stale-while-revalidate: the hook hydrates instantly on mount and background-refetches from Supabase.

**Invalidation rule**: whenever a mutation is known to have succeeded on the client, `invalidateAssetsCache(userId)` must be called immediately — before any `refetchAssets()` call — to prevent stale data appearing on back-navigation or cross-component mounts.

**Current invalidation call sites:**
- `use-chat-session.ts` `send()` / `sendText()` — when `data.assets` is truthy (server confirmed a portfolio change)
- `UndoDeleteToast.tsx` `handleUndo()` — after a successful `POST /api/assets` restore

**Single-tab only**: `BroadcastChannel` for cross-tab invalidation is not yet implemented. A `// TODO: BroadcastChannel for cross-tab invalidation` comment marks the write site in `writeCachedAssets`.

**Sparklines** are cached under `volnar.sparklines.v1.<range>.<symbolKey>` with a 5-minute TTL stored in the blob (`{ data, ts }`). The key is keyed by sorted symbol set + range, so different portfolios don't collide. `invalidateAssetsCache(userId)` scans for all keys starting with `volnar.sparklines.v1.` and removes them — no `userId` needed in the key because it's a prefix scan.

**`useUser` is NOT sessionStorage-cached**: `useUser()` reads from the `UserProvider` React context (in-memory). `PATCH /api/users/me` does not need a sessionStorage bust.

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- `ANTHROPIC_API_KEY`
- `CRON_SECRET`
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` (optional)

## Known Technical Debt

- **Historical mutations have currency-implicit-EUR values**. Rows logged before the native-storage migration have `before_value`/`after_value` stored as EUR-equivalent even when the position was non-EUR priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP; post-migration rows are correct (native currency matching `currency` column).
- **System prompt is verbose**. At 50+ assets, ~50% token compression is achievable. Not yet implemented.
- **No tests**. Zero unit, integration, or E2E coverage. Acceptable for MVP. See `testing-strategies.md` for the activation plan.
- ~~**No analytics**~~ — **shipped**: `@vercel/analytics` with 4 pilot events (signup, first_asset_added, first_chat_mutation, return_visit_day2_plus). See `current-features.md` → Pilot Analytics.
- **Hardcoded FX fallback rates drift**. Review annually if both DB cache and frankfurter.app fail.
- **Two-write atomicity**. Asset update + mutation insert is not transactional. Sentry captures failures.
- **AAPL logo intermittently 404s from FMP**. Falls back to monogram. Display-only.
- ~~**Compound index on `messages (user_id, created_at DESC)`**~~ — **shipped** in `supabase/migrations/20260520_perf_indices.sql`. Also adds `snapshots(user_id, date DESC)` in the same file.
- **Safari OAuth on localhost** is broken (ITP). Production unaffected.
