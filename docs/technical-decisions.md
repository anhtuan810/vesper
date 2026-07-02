# Technical Decisions

## Frontend Stack

- **Next.js 16** (Turbopack) with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Fonts**: Spectral (serif display — big money figures, headings, italic notes, via `--font-serif`), Inter (body + labels via `--font-sans`, tabular figures via `font-feature-settings: "tnum" 1`), IBM Plex Mono (numeric/label detail via `--font-mono`, used sparingly). Loaded by `next/font` in `layout.tsx`; `globals.css` maps them to semantic roles (`--font-display` / `--font-ui` / `--font-label` / `--font-numeric`) — change a role's family there, never in markup.
- **Design tokens** in `src/app/globals.css` (CSS vars on `:root, [data-theme="light"]` and `[data-theme="dark"]`) + `tailwind.config.ts` (utilities) + `src/lib/tokens.ts` (TypeScript mirror for inline JS contexts). Neutrals warmed toward the brass accent 2026-07-02 (see "The Voice & the Plate").
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
- `ai_consent_at` (timestamptz, nullable) — one-time AI data-sharing acknowledgment; server-set to now() the first time the user continues past the AI disclosure sheet (POST /api/users/ai-consent). NULL = not yet acknowledged, so the disclosure shows once on first authenticated load. Never read from the request body (cannot be client-spoofed). Migration `20260614_users_ai_consent.sql`.
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
- `removed_at` (timestamptz, nullable) — soft-delete marker. When set, the asset is excluded from all current-holdings reads (net worth, vitals, holdings, scenarios, Claude's context) but the row and mutation history remain, so backfillSnapshots reconstructs it as held up to removed_at and zero after. Hard delete is still the active removal path; nothing writes this column yet. Migration `20260613_assets_removed_at.sql`.

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
FX rate cache. One row per currency pair. **USD is the internal basis** — values are "1 USD = N quote currency" (e.g. `EUR: 0.89`). 24h TTL, refreshed lazily from frankfurter.app (`?base=USD`). In-process memo cache with 1-minute TTL. `toUsd(amount, currency)` = `amount / rate[currency]`. Display and aggregation no longer double-bridge through USD for cross-currency conversion — `convertCurrency(amount, from, to, rates)` (`src/lib/currency-convert.ts`) computes a single direct cross-rate from this USD-based map, with an identity short-circuit when `from === to`. USD remains the rate table's storage basis, not a forced intermediate hop in display math.

**`rateAt` gap-fill** (`src/lib/snapshot.ts`, used during backfill): wraps `historicalFxRate` (which carries forward from the most recent prior date, falling back to the live rate) with an additional forward-fill from later dates in the series. The result is `null` only when the rate series is entirely empty and no live rate is available — never `NaN` or `undefined`.

### snapshots
Daily net worth records.
- `id`, `user_id`, `total_value` (numeric, **USD** — net worth, not gross; assets converted via `getUsdRates()` at write time, kept as a fallback basis), `native_breakdown` (jsonb, per-currency net-worth sums in their **native currencies**, e.g. `{"EUR": 362000, "USD": 12000}` — the storage-of-record for display/chart conversion), `breakdown` (jsonb keyed by asset type, gross value per type, USD), `date` (date)
- Unique index on `(user_id, date)` enforces one row per user per day
- Written by daily Vercel cron at midnight UTC + fire-and-forget after every successful mutation in `/api/chat`
- Shared writer: `src/lib/snapshot.ts` `writeSnapshot(userId)`; `native_breakdown` is populated by both `writeSnapshot` (live) and `computeRow` (backfill/rebuild)
- Served by `GET /api/snapshots?range=<range>`, including `native_breakdown`. Supported ranges: `1W` (7d), `1M` (30d), `3M` (90d), `1Y` (365d), `3Y` (1095d), `All` (no cutoff). The `1D` range is not used by the net worth chart (it remains only in the `PriceChart` for tradeable assets).
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

### entitlements
Cross-platform subscription entitlement (migration `20260618_subscriptions.sql`). **The single source of truth for paid access**, keyed to the user account, not a device or platform — so a purchase on any platform grants access on all of them.
- `user_id` (uuid PK, FK → users, ON DELETE CASCADE) — one row per user = one active entitlement per user.
- `status` (text, check `in ('trialing','active','past_due','canceled','expired','incomplete')`) — `trialing`/`active` grant access; the rest don't.
- `source` (text, check `in ('stripe','app_store','play_store')`) — which processor/store owns the entitlement; drives the Profile "Manage" destination.
- `plan` (text, check `in ('monthly','annual')`), `current_period_end`, `trial_end`, `cancel_at_period_end`.
- Processor refs: `stripe_customer_id`, `stripe_subscription_id`, `revenuecat_app_user_id`, `product_id`.
- `revenuecat_event_at` (timestamptz, nullable) — source-event time of the last applied RevenueCat write; the mobile webhook drops a strictly-older store event for the same user (out-of-order/retry guard). Stripe needs no equivalent (it re-reads the subscription fresh per event). Migration `20260620_entitlements_event_ordering.sql`.
- RLS: owner-only `SELECT` (`auth.uid() = user_id`); **no write policies** — only the service role writes, from verified webhooks. Never hard-deleted on cancellation (status moves to canceled/expired); removed only with the account.

### billing_events
Webhook idempotency ledger (same migration). Server-only (service role): RLS enabled, no policies. Global, not user-scoped, retained across account deletion.
- `provider` (text, check `in ('stripe','revenuecat')`), `event_id` (text), `received_at`. PK `(provider, event_id)`.
- Each event id is recorded once; a re-delivered webhook collides on the PK and is skipped, so writes never double-apply.

### market_moves
Global cache of daily index % moves (Yahoo closes), used to anchor deterministic "market move" highlights in the Diary around a user's mutation dates. Not user-scoped — same global-reference shape as fx_rates: RLS enabled, no policies (service-role only). Migration `20260612_market_moves.sql`.
- `index_symbol` (text), `date` (date), `pct_change` (numeric), `created_at`. PK (index_symbol, date).

### device_tokens
APNs device tokens for push notifications. Written via POST /api/push/register, read by the market-highlights cron sender (src/lib/apns.ts → pushToUser). Service-role only: RLS enabled, no policies. Migration `20260617_device_tokens.sql`.
- `user_id` (uuid, FK → users, ON DELETE CASCADE), `token` (text), `platform` (text, check in ('ios')), `updated_at`. PK (user_id, token).

### market_swings
Per-user precomputed "market swing" journal entries — big index moves enriched with the user's *real* portfolio impact that day (display currency). Generated in the background (`generateMarketSwings`/`storeMarketSwings` via Next `after()` on data entry + the daily cron) and served fast-path by `GET /api/diary/market-moves`; the read path falls back to computing on the fly (`getDiaryMarketMoves`) and persisting after, so it is safe before the migration is applied. `getStoredMarketSwings` backfills each mover's `assetId` (by symbol → the user's current asset) at read time so older rows still deep-link. Service-role only: RLS enabled, no policies. Migration `20260628_market_swings.sql`.
- `user_id` (uuid, FK → users implied), `date`, `index_symbol`, `index_label`, `pct_change`, `total` (net portfolio day-change, display currency), `currency`, `movers` (jsonb — `[{symbol,label,impact,pct,assetId?}]`), `expanded` (bool — full card vs compact row), `computed_at`. PK (user_id, date). Length/cadence governed by `MARKET_SWING_*` constants in `src/lib/diary-market-moves.ts`.

### decision_verdicts
Cache for the **Decision Verdict** (`src/lib/scenario/decision-verdict.ts` → `assembleVerdict`), which otherwise recomputes from live Yahoo prices + FX on every selection (visible latency). Keyed by **content** (`verdict_key = mode:symbol:occurred_date:units:displayCurrency`), *not* the mutation id, so the cache survives the per-entry demo reseed (new mutation ids for the same trades) and is shared across identical trades/users. One row per distinct decision, refreshed in place when `computed_on` is an earlier day (the figure only drifts with the slow "now" value). Only successful verdicts are cached — `no_prices`/`no_fx`/`no_benchmark` may be transient blips and are recomputed. `readVerdictCache`/`writeVerdictCache` are best-effort: a missing table just means every verdict is computed live (degrades gracefully). The client also prefetches eligible verdicts in the background after the Overview loads, so a click is usually instant. Service-role only: RLS enabled, no policies. Migration `20260628_decision_verdicts.sql`.
- `verdict_key` (text, PK), `computed_on` (date — freshness check vs today, UTC), `payload` (jsonb — the `VerdictData`), `updated_at` (timestamptz).

### demo_users
Per-visitor ephemeral demo accounts (only minted when `DEMO_ENABLED === "true"`). One row per anonymous Supabase user written with the service role on demo entry (`/demo` web, `/api/demo-session` native); `created_at` starts the hard one-hour session clock (`demoExpiredGate`), and the reap-demo cron deletes rows past TTL + grace. Service-role only: RLS enabled, no policies. Migrations `20260622_demo_users.sql` (table) and `20260628_demo_visitor_trial.sql` (adds `visitor_id`).
- `user_id` (uuid, PK, FK → users ON DELETE CASCADE), `created_at`, `visitor_id` (uuid, nullable — links the anon user to its browser; null for native, which keeps the per-user clock).

### demo_visitors
Anchors the per-visitor demo trial to the **browser** so re-entering the demo (e.g. after bailing out of Subscribe) never resets the clock. A persistent httpOnly `demo_visitor` cookie (UUID, 7-day life) survives sign-out; `first_seen` records the browser's first entry and the trial deadline is `first_seen + TTL` for every re-entry. `demoExpiredGate` enforces that same deadline server-side for users with a `visitor_id`. A long-lived tombstone — pruned by the reaper only well past the cookie's life (`DEMO_VISITOR_RETENTION_MS`), so the lockout outlives the per-user data cleanup. Service-role only: RLS enabled, no policies. Migration `20260628_demo_visitor_trial.sql`.
- `visitor_id` (uuid, PK), `first_seen` (timestamptz).

## Cron Jobs

Configured in `vercel.json`:
- Daily at `0 0 * * *` (midnight UTC) → `/api/cron/snapshot`
- Authenticated via `CRON_SECRET` env var. Route checks `Authorization: Bearer ${CRON_SECRET}` and returns 401 otherwise.

## User Preferences Endpoint

`GET /api/users/me` — returns `{ name, avatar_url, display_currency, theme, fingerprint, profile }` for the authenticated user. `Cache-Control: private, max-age=300, stale-while-revalidate=1800`. Added alongside the HTTP caching work as the foundation for loading user preferences in `UserProvider`.

`PATCH /api/users/me` — the only public write path for `users` columns. Strict field allowlist: `{ display_currency, theme, profile }`. Any other field in the body is rejected with 400. `profile` patches are merged (not replaced) — pass `null` or `""` for a field to remove it. Added in PR 1; absorbed avatar updates (PR 7) and theme updates (PR 1). (Historical note: the `/settings` route was removed per Decision 5, later reinstated; since 2026-07-02 settings live in the **account panel** — see "Account Panel" below — with `/settings` kept for deep links.)

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
- **AI disclosure**: a one-time AI disclosure sheet, gated by `users.ai_consent_at`, is shown once before chat use on first authenticated load.

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

## Property Reconstruction (Snapshot History)

**Decision:** historical net worth snapshots reconstruct each property's value with a **two-anchor, shape-from-CBS** approach rather than a flat or linear assumption.

- **Anchors**: the curve passes exactly through `buy_price` at `buy_date` and the asset's current `value` at today. These two points are fixed; nothing else can move them.
- **Shape**: between the anchors, the curve follows the **shape** of the CBS regional price index (PBK), fit at fractional-year (month) precision via **monotone-cubic (Fritsch-Carlson / PCHIP) interpolation** — smooth, no overshoot. CBS supplies shape only; the fit is rescaled so both anchors hold exactly.
- **Fallback**: if the CBS region can't be resolved or fewer than 2 index points exist, the value is interpolated **linearly in time** between the two anchors instead.
- **Acquisition guard**: a property contributes nothing to snapshots dated before its `buy_date`.
- **Mortgage balance**: a smooth historical balance curve is built via `projectMortgage` (the same projection `MortgageBlock` uses), sampled at fractional-month resolution from `mortgage_start_date` (or `buy_date`) to today, clamped to `[0, grossValue]`. Falls back to `computeCurrentBalance` when `projectMortgage` can't build a schedule.
- **Rebuild trigger**: editing a property's mortgage or value triggers a snapshot rebuild from that property's acquisition date forward, keeping historical equity consistent with the latest inputs.

**Files:** `src/lib/snapshot.ts` (`monotoneCubic`, `realEstateT`, `realEstateBalanceAt`), `src/lib/mortgage.ts`, `src/lib/cbs-pbk.ts`, `src/lib/property-region.ts`, `src/lib/property-estimate.ts`.

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
- **Intake gate is deterministic** (`validatePensionChange` in `src/lib/pension-intake.ts`): chips-first, type-first. For capital pensions, `value`, `mortgage_rate` (growth), and `access_age` are required with no silent defaults. For income pensions, only `annual_income` is required; `access_age` is optional and defaults to `DEFAULT_PENSION_ACCESS_AGE` (67) when omitted (`apply-changes.ts` applies the default on both add and edit). `pension_provider` and `monthly_contribution` are never required for either shape — recorded only if volunteered. A mandatory confirmation echo gates the commit; the gate is enforced in both the echo (`proposal-resolver.ts`) and the write path (`apply-changes.ts`), so an incomplete pension can never be saved. Every confirmed add and edit writes a `mutations` row; the pension activity verb is "Added"/"Recorded" (income amounts "€X / year"), never "Bought".
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
- **FX bridge**: USD remains the internal basis for `fx_rates` (`toUsd`, `getUsdRates`), but display and chart conversion go through `convertCurrency(amount, from, to, rates)` (`src/lib/currency-convert.ts`) — a single direct cross-rate with an identity short-circuit when `from === to`. `toUsdClient(amount, currency)` remains the synchronous client-side USD helper (precise for EUR and GBP; other currencies fall back to 1:1) and is still used where a USD figure is genuinely needed.
- **Aggregation**: `snapshots.total_value` (USD) and `mutations.portfolio_total` (USD) are kept as a fallback basis. `snapshots.native_breakdown` (per-currency native sums) is the storage-of-record for the net worth chart; `useNetWorth` sums the EUR-fixed total via a direct cross-rate (not a USD double-bridge).
- **Display**: per-user via `users.display_currency` (EUR / USD / GBP). `formatMoney(nativeValue, nativeCurrency, displayCurrency)` converts native → display directly via `convertCurrency` (identity for same-currency), both server-side and via a client `toDisplay()` wrapper.
- **Number formatting is forced to `nl-NL` locale** for all currencies regardless of user locale — `€616.086`, `$616.086`, `£616.086` (dot thousand separator, comma decimal). Deliberate brand-consistency override.
- **Inputs**: chat is the only modification surface. Chat prompts are parameterized with `displayCurrency`; goal targets are converted from display currency to USD via FX rates before INSERT.
- **Real estate native currency**: captured at add time via `countryToCurrency()` in `src/lib/country-currency.ts` (NL/DE/FR/ES/IT→EUR, US→USD, UK→GBP, other→EUR).
- **Math**: never in display currency. Native currency for per-asset arithmetic and chart storage; USD remains the `fx_rates` basis and a fallback for legacy aggregation paths. `build-inputs.ts`'s `toEur` uses `convertCurrency` directly, falling back to the old USD double-bridge only when a direct rate is missing.

## Snapshot Calculation Rules

- `total_value` = net worth in **USD** (real estate contributes equity via `computeCurrentBalance`; each asset value converted from native via `getUsdRates()`), kept as a fallback basis
- `native_breakdown` = jsonb of per-currency net-worth sums in native currencies — the storage-of-record for chart display, populated by both `writeSnapshot` and `computeRow`
- `breakdown` = jsonb keyed by asset type, summing gross `value` per type (USD)
- Computed in `src/lib/snapshot.ts` from current asset state at write time
- **Cadence is portfolio-aware** (`targetSnapshotDates(earliest, today, hasTradeables)`): portfolios holding any tradeable asset (stocks/ETF/crypto/gold) get daily granularity for the last 30 days, weekly from 30 days to 1 year, monthly beyond that. Portfolios with no tradeables (property-only, cash-only, etc.) get a **monthly-only** cadence end-to-end — the first of each month from the earliest holding to today. `writeSnapshot` always writes today's row regardless of cadence.
- **Month-anchored property and FX**: for every snapshot date, a real estate asset's value, its mortgage balance, and the FX rate used to convert it are all evaluated at the first of that date's calendar month (`YYYY-MM-01`, clamped forward to the asset's `buy_date` if later) — including the current month, with no special-case for "today." Stocks, ETFs, cash, bonds, and pensions remain at exact-date granularity.

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
| `/api/holdings-at` | GET | 3600s | — |
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
- `NEXT_PUBLIC_API_ORIGIN` (native build only)
- Subscriptions — Stripe (web): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_ANNUAL`
- Subscriptions — RevenueCat (mobile): `NEXT_PUBLIC_REVENUECAT_IOS_KEY`, `NEXT_PUBLIC_REVENUECAT_ANDROID_KEY` (Android, later), `NEXT_PUBLIC_REVENUECAT_ENTITLEMENT_ID`, `REVENUECAT_WEBHOOK_AUTH`, `REVENUECAT_MONTHLY_PRODUCT_ID`, `REVENUECAT_ANNUAL_PRODUCT_ID`, `REVENUECAT_ALLOW_SANDBOX` (staging/dev only — never `true` in production), `REVENUECAT_SECRET_API_KEY` (optional; server-only, enables RevenueCat-side customer deletion on account deletion)
- All names are listed in `.env.example`. No keys or price IDs are hardcoded. Server-side vars (everything not `NEXT_PUBLIC_*`) live in **Vercel → Project → Settings → Environment Variables**, scoped per environment; see `docs/payments-setup.md` for the full provider/dashboard setup.

## Subscriptions / Entitlements (2026-06)

Commercialized with cross-platform subscriptions: sign in once, subscribe from any platform, full access everywhere. 7-day free trial (card-on-file on web; a StoreKit intro free trial on iOS), then €9.99/month or €99.99/year (annual preferred, "2 months free"). Trial length is the single `TRIAL_DAYS` constant in `src/lib/subscription.ts`. Provider/dashboard setup (Stripe, RevenueCat, App Store Connect, sandbox testing) is in `docs/payments-setup.md`.

- **Single source of truth**: the `entitlements` table (above), keyed to the Supabase user account. The server decides access; clients only read it via the authed `GET /api/subscription` (or their own RLS row).
- **Two writers, both verified webhooks**, each matched to the Supabase user id:
  - **Stripe** (`POST /api/webhooks/stripe`) — web. Verifies the `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`. Checkout stamps `client_reference_id` and `subscription_data.metadata.supabase_user_id` with the user id; customer metadata too. Maps `customer.subscription.*` to the entitlement.
  - **RevenueCat** (`POST /api/webhooks/revenuecat`) — mobile. Verifies the `Authorization` header against `REVENUECAT_WEBHOOK_AUTH`. The SDK is configured with `appUserID` = Supabase user id, so every event maps to an account.
  - Both are idempotent via `billing_events`. Invalid signature/auth or malformed input is rejected (400/401). Cross-source writes never let one processor's expiry revoke the other's active entitlement (see `upsertEntitlement`).
- **Platform-correct purchase path**: web uses Stripe Checkout (`POST /api/checkout`); the native app uses RevenueCat/StoreKit (`src/lib/native/purchases.ts`) and never the web checkout. The native purchase SDK (`@revenuecat/purchases-capacitor`) is **only ever `import()`-ed at runtime behind an `isNative()` guard**, so the web bundle never imports it.
- **Surfaces**: a paywall (`src/components/Paywall.tsx`) gates the app when not `trialing`/`active`, with Restore (native), the Apple auto-renew disclosure, and Terms/Privacy near the buy button; a Profile "Your subscription" section (plan, status, renewal/expiry in nl-NL, source, Manage, trial CTA); a marketing pricing section. Manage routes per source: Stripe billing portal (`POST /api/billing-portal`) for web, App Store subscriptions for iOS, Play subscriptions for Android.
- **Native SDK identity (logIn/logOut, not re-configure)**: `src/lib/native/purchases.ts` calls `Purchases.configure()` **exactly once per process**; an account switch then identifies the new user with `Purchases.logIn(appUserID)` and sign-out clears it with `Purchases.logOut()`. Re-calling `configure()` is unsupported — it logs RevenueCat's "Purchases instance already set" warning and can alias/transfer subscribers between accounts. This matters because native sign-out is an SPA navigation (`router.replace`, see `useSignOut`), so the SDK stays in memory holding the previous user's `appUserID`; `logOut` is best-effort and non-blocking (the next sign-in's `logIn` corrects identity regardless).
- Account deletion (`DELETE /api/users/me`) removes the entitlement row (listed explicitly), cancels an active Stripe subscription, deletes the Stripe customer (erasing its PII; also cancels any lingering web sub when the current source is a store), and best-effort deletes the **RevenueCat customer** (`deleteRevenueCatCustomer`, `src/lib/revenuecat.ts`) so no mobile-purchase record lingers. The RevenueCat deletion is gated on `REVENUECAT_SECRET_API_KEY` (no-ops if unset), treats `404` as already-clean, is bounded by a 5s timeout, and swallows errors to Sentry — it can never block or fail the deletion. A store subscription itself still can't be cancelled server-side; only the user can, in their store settings (the delete dialog warns them).

### Hardening (2026-06)
- **Server-side enforcement, not just the paywall**: the client paywall is only an overlay, so premium/cost-bearing routes also gate server-side via `entitledGate` (`src/lib/require-entitled.ts`) — chat, insight, diary-summary, diary/market-moves, and the scenario compute/counterfactual/project routes return **402** unless the caller is entitled. A bypassed overlay (devtools, a direct API call) no longer reaches Anthropic.
- **Dunning grace**: access is decided by `hasAccess(status, current_period_end)` (not raw status) — `past_due` keeps access until the period already paid for ends, then gates. The paywall then offers "Update payment method" (Stripe portal / store) instead of a fresh checkout; Profile shows a "Payment due" card.
- **Out-of-order webhooks**: the Stripe webhook re-reads the subscription fresh from the API on every event (always current state); the RevenueCat writer drops a strictly-older store event using a `revenuecat_event_at` watermark (`20260620_entitlements_event_ordering.sql`).
- **Update path is not inert (audited 2026-06)**: the row is created once at checkout, so every later `customer.subscription.updated` hits the UPDATE side of `upsertEntitlement`'s write. That write is a merge-duplicates upsert (`ON CONFLICT DO UPDATE` — the supabase-js `ignoreDuplicates: false` default, confirmed in `@supabase/postgrest-js`), so `cancel_at_period_end`, `status`, `current_period_end`, and `trial_end` all persist to the existing row. The cross-source revoke guard only fires when the incoming source *differs* from the stored one, so a Stripe→Stripe write is never swallowed. Locked by `scripts/verify-entitlement-upsert.ts`, which drives the real `upsertEntitlement` against an in-memory model of the PostgREST upsert contract and asserts the *persisted* row across create → cancel → don't-cancel → status change (not the mapper output, which `verify-entitlement-mapping.ts` already covers).
- **Portal cancel-at-period-end lives in `cancel_at`, not the boolean (fixed 2026-06)**: in the pinned `2026-05-27.dahlia` API a billing-portal "cancel at period end" is recorded as a scheduled `cancel_at` timestamp (what the Dashboard's "Cancels <date>" badge reflects), while the legacy `cancel_at_period_end` boolean stays `false` — the same kind of moved field as `current_period_end` → items. The mapper read only the boolean, so a cancelled subscription persisted `cancel_at_period_end = false` even though the webhook returned 200 and re-read fresh state. `mapStripeSubscription` now sets it from `cancel_at_period_end === true || cancel_at != null` (covers both representations; "Don't cancel" clears both → false). NB: one portal cancel emits two near-simultaneous `customer.subscription.updated` events → two overlapping webhook invocations, but each re-reads current state and writes the same value, so they converge idempotently (verified on the live path with temporary structured logs). Regression-covered by `verify-entitlement-mapping.ts` (cancel_at / legacy-boolean / not-cancelling) and `verify-entitlement-upsert.ts` (end-to-end dahlia cancel + two concurrent events).
- **Deleted-user webhooks**: a store/Stripe event for an already-deleted account (FK violation) is ack-and-skipped, not retried into a 500 loop.
- **Sandbox isolation**: RevenueCat SANDBOX events are rejected in production unless `REVENUECAT_ALLOW_SANDBOX=true`, so a sandbox purchase can't self-grant real access. Set it (per Vercel environment) **only** on staging/dev — never Production. Real App Store purchases are `environment: PRODUCTION` and are always accepted, so this gate never blocks paying users. Because the bundled iOS app hardcodes its API origin to production (`scripts/build-native.mjs`), exercising a full sandbox purchase end-to-end requires the var on the server the app actually calls; see `docs/payments-setup.md` → Sandbox testing.
- **Transfers**: a RevenueCat `TRANSFER` revokes the previous owners (`transferred_from`) so a stale grant can't linger on an account that lost the subscription. This also means two app accounts sharing **one** Apple ID can't both be subscribed — Apple allows one active subscription per group per Apple ID, so the entitlement transfers between them. Testing two simultaneous subscribers needs two separate sandbox testers.
- **One trial per account**: web checkout grants the 7-day trial only when no entitlement row exists yet; a returning (cancelled) subscriber is charged immediately. StoreKit enforces its intro free trial per Apple ID natively.
- **`billing_events`** is pruned (>90 days) by the daily cron so the idempotency ledger doesn't grow unbounded.

## Chat Correctness Audit & Remediation (2026-06)

A full audit of the chat write/read path (the app's primary surface) and its UI. All fixes are live; the behaviours are guarded by the test suite in the next section.

- **Net worth in the display currency (hero-number bug)**: `buildDynamicContext` previously handed the model only `net worth ~$X USD-equivalent` and told it to render in the display currency, so the model did the FX itself and **overstated net worth for EUR/GBP users** (the seeded demo account reported ~€419k vs the deterministic ~€368k). The context line now carries net worth **already converted to the display currency** (`total * usdRates[displayCurrency]`) and instructs the model to quote it directly — no model-side FX on the headline. Locked by `scripts/verify-dynamic-context.ts`.
- **Irreversible-delete server gate**: a remove with `removal_reason:"mistake"` hard-deletes the asset **and** its mutations (unrecoverable). The model is told to route every remove through propose→confirm; as a server backstop `/api/chat` now downgrades any unconfirmed bare `<changes>` `"mistake"` remove to a recoverable `"sold"` soft-delete. The destructive path is honoured only on a confirmation turn.
- **Write atomicity (add path)**: asset insert and its `add` mutation are separate calls. If the mutation insert fails, the orphaned asset is now **rolled back** (`apply-changes.ts`) instead of leaving a holding with no acquisition anchor (which corrupted history rebuild and the Diary). Edit-mutation failures are surfaced for monitoring. (Multi-row batches stay per-row best-effort by design; see debt below.)
- **Historical-price guards** (`prices.ts`, `acquisition-date.ts`): the buy-date match is bounded to the ±4-day request window — a pre-IPO / sparse / future date no longer fabricates a price from the nearest close; `Invalid Date` returns null explicitly; the date parser rejects future months.
- **Currency default**: cash / bonds / other / pension adds with no stated currency now default to the user's **display currency**, not USD (`displayCurrency` threaded into `applyPortfolioChanges`).
- **Value-mode guards**: a value-mode add/edit whose derived size rounds to 0, or a value-delta that oversells the position, raises a `ValueModeError` instead of storing a ghost/negative position; a missing FX rate is a hard error, not a silent 1:1.
- **Price re-validation on confirm**: the Turn-2 freshness check now runs on **every** confirmed-proposal commit (`confirmedProposal` flag), not only when the propose→confirm gap exceeded 60s — a fast confirm can no longer store stale units. Direct (non-confirmation) adds never trigger it.
- **Honest truncation + handshake guards**: a truncated/garbled `<changes>` block is surfaced as an explicit "nothing was saved" message instead of being swallowed while the receipt claims success; `"Yes, that's the address"` is in `CONFIRMATION_CHIPS` (closes the property-add re-render loop); the ETF venue branch has a reply-turn re-emit guard.
- **Frontend** (`use-chat-session.ts`): a synchronous in-flight ref stops a double-tap from double-applying a mutation; the chat POST has a 60s timeout so a hung request can't freeze the composer; a failed send restores the composer text and drops the orphaned optimistic bubble; a 429 locks the composer; cache invalidation is driven by an explicit `portfolioChanged` response flag; message/chip React keys are stable (no full re-animate on load-more).
- **Shared `apiFetch` timeout** (`src/lib/api.ts`): opt-in `timeoutMs` (no default — long-running callers like `/api/chat` are unaffected unless they pass it) that aborts and rejects with "Request timed out". The AI-consent gate passes it so a stalled consent write can't freeze the "Saving…" button.

## Automated Testing & Chat Behaviour Evals (2026-06)

Three layers, mirroring how the chat works. Replaces the former "No tests" debt.

- **Per-commit CI** (`.github/workflows/ci.yml`) — on every push to `main` and every PR: `npm run typecheck` (full `tsc --noEmit`) then `npm test`. `npm test` runs `scripts/run-tests.mjs`, which executes every `scripts/verify-*.ts` (pure, hermetic — no network / DB / LLM / secrets) and fails on any; new `verify-<name>.ts` files are picked up automatically. Covers acquisition-date parsing, chip sanitisation, tag extraction, the add/edit/remove + pension validators, net-worth-context presentation, plus the existing scenario / projection / cost-basis engines.
- **Model eval** (`scripts/eval-chat.ts`, `.github/workflows/chat-eval.yml`) — **manual-trigger only** (Actions → Run workflow); no schedule, so it never spends tokens on its own. Sends ~37 scenarios to the real `claude-sonnet-4-6` with the production prompt and asserts the emitted control tags match intent — the model's **decision only** (no DB / prices / auth). Assertions test robust safety invariants ("never silently mutate", "commit when complete"), not brittle wording, since the model legitimately varies ordering/phrasing. Needs the `ANTHROPIC_API_KEY` repo secret; skips cleanly without it; kept off per-commit CI (token cost + non-determinism). Scenarios span batch list-adds, single-add corner cases, edits/corrections, removes, real estate, pension, cash/bonds, what-if scenarios, guardrails (advice boundary, no-live-prices, prompt injection, off-topic) and read-not-add traps.
- **Demo read eval** (`scripts/eval-chat-demo.ts`, `.github/workflows/demo-eval.yml`) — **manual-trigger only**, **read-only**. Signs into the shared demo account (which reseeds the deterministic "Alex" portfolio), asks 8 questions through the real `/api/chat`, and asserts the answers contain the known seeded values (40 NVIDIA, 0.07 BTC, €26k cash, €34k pension, Amsterdam+Rotterdam, EUR, net worth ~€368k). Exercises the full path auth→DB→model→answer. Targets the **deployed** app (`APP_BASE_URL`, default `https://app.volnar.nl`; the server holds the demo creds + Anthropic key), so it **lags a fix until Vercel redeploys**. Uses ~8 of the demo account's 50 daily chat calls and **skips (never fails) on a 429**; only asks questions, never writes, so it cannot corrupt the shared account.

## Mobile Foldable Vitals & Profile (2026-07)

The mobile Vitals and Profile pages moved from card grids to a **foldable-row
grammar** (`src/components/FoldRow.tsx`): each section is a two-line row — title
plus a plain-language question on the left ("how much rides on your biggest
holding"), the figure plus a one-word status on the right, chevron to unfold the
full chart/detail. Rules that make it work:

- **Exceptions self-open**: an amber/red vital starts unfolded (`foldStatus` in
  `VitalsContent.tsx`); green ones start folded. "Unfold all / Fold all" sits in
  the meta row. Fold state persists per session (`volnar:vitals-open`,
  `volnar:profile-open` in sessionStorage).
- **Desktop unchanged** — the fold grammar is mobile-only; the grid cards remain
  for the desktop WebShell (`buildConfig(key)` is shared by both renderers).
- **Letter grades (2026-07)**: each active vital's fold row carries an A–D chip
  (`src/lib/vitals/grade.ts`) so the number is instantly legible. DERIVED, never
  independent: amber → C, red → D always (the grade cannot contradict the
  status word); the only refinement is inside green — A comfortably in range,
  B approaching the amber threshold, with cut-offs anchored to the band
  functions' own thresholds. Concentration self-derives from the
  investable-first pct so both property lenses agree. Liquidity's
  "insufficient" state gets no grade. Covered by
  `scripts/verify-vital-grade.ts`. Mobile-only for now (desktop cards
  unchanged).
- **One Pulse family**: the Pulse sentence and every row under it (projection,
  Worth knowing, Markets) share `SIGNAL_TEXT_STYLE` from
  `SwipeExpandCarousel.tsx` — one text spec, one source. New signal-like rows
  must use it, not hand-rolled styles. (Superseded in part by the 2026-07-02
  "Voice & the Plate" pass below: the family is now four one-line rows on one
  wash, and the old `SignalRow` shell is gone.)
- Profile follows the same grammar (Perspective open by default, Context, Plan
  via `SubscriptionSection`'s `embedded` prop).

## Net-Worth Chart: Time-True Axis & Touch Model (2026-07)

- **Time-true x-axis**: points are placed by date via `timeFractions()` /
  `nearestIndexForFraction()` (`src/lib/networth-axis.ts`), not index spacing —
  a sparse-then-daily history no longer distorts. ONE shared `xs` array drives
  the line, bands, edges, markers, scrub and guide; `calcIndex` inverts the same
  mapping so the cursor lands under the finger.
- **Scrub is a held gesture, never a parked state.** While held, the hero shows
  the point's value + dateline and the chart shows a breakdown-only card
  (asset-class values; no date/total header — the hero carries those). Release,
  `touchcancel`, `mouseleave`, or backgrounding the app (visibilitychange) all
  return to the resting display. An anonymous point on the line can be READ but
  never SELECTED.
- **Ghost-mouse guard**: mobile browsers replay taps as synthetic
  mousemove/click with no mouseleave. After the first real touch, the chart's
  mouse handlers are dead for good (`touchedRef`) — desktop hover unaffected.
- **Two tight radii** around decision dots: hover preview `max(10, 3%W)`
  (essentially on-dot — hovering the open line must show the breakdown card,
  not an entry box), touch-tap commit `max(12, 3.5%W)`. Mouse click commits
  only what the preview already shows. Do NOT widen these: on a dense timeline
  every hover/tap starts hitting a dot, which reads as accidental rewinds and a
  "slow hero" (learned the hard way).
- **"Now" (footer label)** returns the WHOLE page to today via `onNow`: clears
  held/parked scrub, exits the rewind, deselects the entry. It must never park
  a selection at the tip (its pre-rewind behavior).
- **Demo history protection**: `backfillSnapshots` returns early for demo
  accounts — the demo curve is hand-authored (`SNAPSHOT_ANCHORS`) and a
  mutation-timeline rebuild would replace it with a collapsed one (symptom:
  deep near-zero notches at the start of the line, bottoming at the first
  decision's date). Hardened 2026-07-02 into TWO layers: an env short-circuit
  (`DEMO_USER_ID`, no DB read — race/outage-proof) and a FAIL-SAFE entitlement
  check (`product_id = 'demo'`; an errored read aborts the pass — a skipped
  real-user backfill just retries later). Price valuation also falls FORWARD
  to the first candle (`priceAtOrBefore(...) ?? history[0]`) so pre-listing
  dates can't zero a row. A corrupted demo history self-heals on the next
  demo entry (reseed wipes snapshots). Full incident analysis:
  `docs/audits/demo-networth-cliff.md`.

## Named Rewind — Decision Time Travel (2026-07)

The Overview's differentiator feature: picking a journal entry stands the WHOLE
page at that entry's day — hero number AND holdings list — so the user can see
what they owned and reflect on why they decided. Model:

- **Hero precedence: scrub (held) > rewind (parked) > live.** Rewound at rest:
  date eyebrow above a slightly-dimmed number, "← Back to today" chip. Named
  time may persist (the entry says what it is); anonymous time may not. NO ≈
  prefix on the number — a position that couldn't be valued speaks through its
  own row ("no price record"), never through the total.
- **Ways in**: tap a decision dot on the chart, or the "Portfolio on this day →"
  action inside the journal entry (the big-target, primary path; the action
  hides while already standing on that entry). Today-dated entries offer
  nothing. Liquid lens never rewinds (the reconstruction is the full book).
- **Ways out** (all identical via `exitToNow`): "Back to today" (hero chip or
  holdings header), "Now", range switch, entering Liquid, leaving the tab. All
  land on the **Now face**: no highlighted dot, live everything, and the entry
  zone shows a generic invitation ("Tap a dot on the line…") instead of an
  entry — today has no entry, so none is shown. Since 2026-07 this is ALSO the
  fresh-load default: nothing is selected until the user taps a dot (the old
  newest-entry-selected default and its separate `deselected` flag are gone).
  Exception: Liquid · 1D has no dots to tap, so it keeps the newest-entry
  teaser instead of an invitation that can't be followed.
- **Server reconstruction** (`reconstructHoldingsAt` in `src/lib/snapshot.ts`,
  served by `GET /api/holdings-at?date=`): units from the mutation timeline ×
  that day's close; real estate via the SAME CBS-progress + mortgage-schedule
  samplers the backfill uses (extracted shared functions — the two paths cannot
  diverge); flat types at recorded value (row caption "recorded value";
  property rows "equity after mortgage"). Income pensions excluded. Prices use
  the backfill's exact convention: full series + `priceAtOrBefore ?? history[0]`.
  **The hero-at-rewind total is summed from the same rows the list renders** —
  the number and the list can never disagree. Read-only; returns `[]` for
  `date >= today`.
- **Latency architecture** (the demo lives on this gesture):
  - Warm-instance memos (module scope, success-only): full price series per
    symbol (12h TTL, refetched if earlier coverage needed), PDOK
    `resolveRegion` per address, CBS `getRegionIndex` per region. After the
    first rewind on a warm instance, any other date needs zero external calls.
  - Inside one reconstruction: the two Supabase reads go out together; the
    property half and the price half run concurrently.
  - **Client prefetch**: `PortfolioTab` reconstructs the 8 newest entry days in
    the background (350ms stagger) as soon as decisions are known — taps then
    render from the session cache in ~tens of ms. Fetches are idempotent
    (cache mirror + in-flight set), safe under StrictMode remounts and
    revalidations.
  - **Records-stamp invalidation**: caches key on `mutations.length + newest
    recorded_at` — the same events that trigger `backfillSnapshots(rebuildFrom)`.
    When it advances: session cache dropped, fetch URL changes (busts the 1h
    browser HTTP cache), in-flight responses from the old records are
    discarded, prefetch re-warms. **A rewound book must never outlive the
    records it was built from.**

## The Voice & the Plate (2026-07)

Token-level retheme + the Pulse-family redesign (mock: `docs/design/redesign/pulse-voice-plate.html`).

- **One face, one voice.** The pulse family uses the SAME typography as the
  rest of Volnar — the italic display voice (Inter) at `--fs-body` via
  `SIGNAL_TEXT_STYLE`. No dedicated typeface: a serif "voice" was tried and
  rejected (Vitals read as a different app). Figures inside the Pulse
  sentence differ by gold colour only, never by font (`toSafeHtml` emits
  `.pulse-em`, plus `.pulse-fig` when the emphasis carries a digit).
- **Four one-line pulse rows (mobile).** The narrative Pulse, projection,
  Worth knowing and Markets are four single-line rows on ONE full-bleed
  `--accent-soft` wash — no icons, no boxes, everything flush left. Each row
  expands in place (`SignalDropBox`: plain dim detail + exactly ONE short gold
  trigger clause, no card chrome); the expanded content renders BELOW the
  title row, outside the carousel flex, so the aside/dots column can never
  squeeze it. The wash header carries the dateline, the heartbeat hairline
  (`PulseTrace`, draws once per session via `usePulseTraceOnce`; static under
  reduced motion) and the vitals count — the trace lives inside the header row
  so it costs no height. A quiet "· new" appears on the dateline only when
  today's sentence differs from the last one this device saw
  (`volnar:pulse-seen` in localStorage). The Pulse sentence renders clipped to
  one line collapsed; expanded it unclips, with the chevron pinned to the
  first line.
- **The plate (desktop).** The standalone `PulseBanner` renders on `--plate`:
  warm ink on the light theme, gold leaf on dark.
- **Triggers pre-fill the chat composer.** Worth knowing
  (`insightQuestion()`: short row label + full standalone question matched to
  the card — housing / concentration / cash / currency) and Markets (headline
  + "what does this mean for my NVDA position?") write the question into
  `volnar.empty.input` — the chat page's existing composer-prefill channel —
  so the user lands with the text ready to edit or send. Pulse
  ("Pressure-test this →") and projection ("See what moves it →") open the
  what-if explorer (`requestExplore`: cone + chips). Markets slides also show
  the cron's stored `impact_eur` aside ("≈ +€85", hidden when null/sub-euro).
- **Warmed neutrals.** Both themes' neutrals now bias toward the brass accent
  (paper `#F6F5F1`, night `#131109`) instead of blue; semantic
  (positive/negative/amber) and categorical chart tokens are unchanged. Synced
  in `globals.css`, `layout.tsx` `themeColor`, and `src/lib/tokens.ts`.
- **Gold ground = "Volnar noticed this for you".** The `--accent-soft` wash is
  the one signalling rule for machine-written content: the pulse family wash
  on Vitals AND the Journal's auto-logged market entries (`DiaryMarketRow`,
  `MobileMarketEntry` — surface-circle gold glyph, mover-ledger hairlines at
  `border-strong` so they read on the tint). The user's own entries stay on
  plain paper; the contrast is the selling point.
- **Vertical compactness rule**: the pulse family must not push the first
  vital rows below the fold — one line per row collapsed, terse projection
  copy, meta row tightened. Deferred to v2: ember treatment on band-change
  days, vitals-aware explorer chips.

## Account Panel — left drawer (2026-07)

IBKR-style account drawer, replacing the scattered settings entry points.

- **Entry**: a person-silhouette in a hairline circle (the brokerage
  convention — deliberately monochrome, not an initial "avatar") at the far
  LEFT of the mobile/desktop `NavBar` opens `AccountPanel` — a left slide-in
  drawer (scrim + panel, `--z-modal`, Escape/scrim-tap closes, body scroll
  locked). The top bar's right side is now EMPTY: user name, Portfolio gear
  and the price-refresh control are all gone (prices refresh on load and on
  the price cache's TTL; NavBar still accepts the refresh props for call-site
  compatibility but ignores them).
- **Contents**: account header (avatar · name · email · net worth in the
  display currency) + ALL settings via `SettingsContent embedded` (same
  component as `/settings`, minus the page chrome). Settings body lazy-mounts
  on first open so page loads don't pay its fetches.
- **Profile tab** no longer links to Settings — it is purely "your picture"
  (Perspective / Context / Plan). The `/settings` route still works for deep
  links.
- **Gotcha encoded in the code**: the drawer's at-rest-open transform is
  `none` (not `translateX(0)`) so the fixed-position overlays inside
  SettingsContent (delete dialog, currency toast) position against the
  viewport, not the transformed drawer.

## The First 60 Seconds (2026-07)

The demo visitor's opening minute, sequenced from three small pieces
(mobile-wow-moments items 1 + 5, plus a chat hand-off):

- **First Breath (all mobile users).** First Overview open of a session: the
  net-worth line draws on (~1.15s), the decision dots rise oldest→newest
  (stagger clamped ~0.5s), and the journal zone fades in as the last dot
  settles (`.nw-reveal-late`). `PortfolioTab` now passes `revealLine` to
  `NetWorthChart`; the `nw-line-draw` / `nw-dot-rise` rules moved from
  `home-twilight.css` (`.vhome`-scoped) to `globals.css` so desktop and mobile
  animate from one definition. Play-once per session
  (`volnar:mobile-overview-revealed`); static under reduced motion.
- **Demo Confession (demo accounts only).** After the reveal settles (~2.4s),
  the seeded Adyen panic-sell entry performs the FULL dot-tap gesture: it
  selects itself, unfolds, AND stands the whole page at its day (hero, chart
  guide and holdings agree on one moment — a selected entry over a live "now"
  page read as a glitch), with "Back to today" teaching the way out. Found by
  symbol+action (`remove` + `ADYEN*`, never mutation id: reseeds regenerate
  ids). Its verdict and the day's holdings reconstruction are both warmed
  immediately (fire-and-forget) so the unfold lands with the arithmetic and
  the rewound book ready. Exactly once per session (`volnar:demo-confession`). `MobileDecisionJournal` now
  opens when it MOUNTS with a selection (initializer, not just the
  change-adjust) — required because the journal only mounts on selection since
  the Now-default change.
- **The "now what?" beat (demo only).** Under the opened entry, one gold
  question — "What else did my decisions cost or make me?" — pre-fills the
  chat composer (`volnar.empty.input`) and lands in chat ready to send.
- **DECISION JOURNAL chat context.** So that question gets a REAL answer: the
  chat's dynamic context now carries every logged decision (buys/sells/trims,
  newest first, capped at 12; the route fetches up to 200 mutations instead of
  10) with dates, units, recorded values, the user's own notes, and — when a
  same-day cached verdict exists — the deterministic look-back spelled out
  with figures ("holding on would have gained ~EUR 4,120…"). Verdicts are
  cached-only via `readCachedVerdictsForMutations` (one indexed select on
  `decision_verdicts`, never a live compute — chat latency is unaffected); the
  key derivation is shared with `assembleVerdict` via `verdictKeyForMutation`.
  The block instructs the model to use these figures and never invent cost
  basis. Covered by `scripts/verify-dynamic-context.ts`.
- **The Seal Tears (all users).** The FIRST verdict opened in a session
  performs its reveal: the perforation draws itself left→right (`.perf-draw`,
  clip-path, ~0.5s), the "Looking back…" sentence rises a beat later
  (`.lookback-rise` + 0.45s delay; the gold figure is simply present — no
  count-up), and one Light haptic fires as the sentence settles
  (`onAnimationEnd`, never a timer). Once per session
  (`volnar:verdict-torn`); static under reduced motion.
- **Measurement (shipped).** `demo_verdict_seen` fires once per demo session
  when an open entry first has its look-back on screen (no properties).
  `first_asset_added` now carries `minutes_since_signup` (server-computed from
  the auth user's `created_at`, forwarded via `analyticsProps`) — the
  time-to-first-asset half of the 60-second-hook metric.
- **Screenshot-first empty state.** The fresh-account Overview's "Try starting
  with" list now leads with the screenshot row ("the fastest way in") — one
  screenshot of a broker's positions page beats typing ten holdings.

## Session log — 2026-07-02 (Pulse family → account panel → the first 60 seconds)

One session, seventeen commits on `main`; every item has a full section above.
The audit trail for "why does X look/behave like this since July 2":

- **Pulse family redesigned three times to converge** (mock → dark plate →
  four one-line rows, each expanding in place with ONE gold trigger into
  chat): see "The Voice & the Plate". A serif voice and white drop-down boxes
  were tried and explicitly rejected — don't reintroduce them.
- **Warm retheme**: both themes' neutrals biased toward the brass accent;
  browser/theme-color + `tokens.ts` synced.
- **Gold ground rule**: `--accent-soft` marks machine-written content
  everywhere (pulse rows, Journal market entries).
- **Account panel**: IBKR-style left drawer behind the top-left silhouette
  button; ALL settings live there; NavBar right side is empty (name, gear and
  price-refresh removed); Profile tab is purely Perspective/Context/Plan.
- **Overview rests at Now**: no journal entry selected on load; the old
  `deselected` tri-state is gone. See "Named Rewind → Ways out".
- **The first 60 seconds** (demo hook): First Breath reveal, Demo Confession
  (full dot-tap gesture incl. rewind), Seal Tears verdict reveal, pre-filled
  chat question, DECISION JOURNAL chat context (the model now sees every
  logged decision with values/notes/cached verdicts), `demo_verdict_seen` +
  `minutes_since_signup` metrics, screenshot-first empty state. See "The
  First 60 Seconds". mobile-wow items 1, 3, 5 shipped; 2, 4, 6 remain.
- **Demo backfill guard hardened** (env short-circuit + fail-safe entitlement
  read) after the chart-dip incident resurfaced. See "Demo history
  protection" under Net-Worth Chart.
- **Vitals letter grades** (A–D, derived from bands, mobile fold rows): see
  the foldable-Vitals section and `vitals-metrics-reference.md`.
- **Chat APP KNOWLEDGE block updated** (`src/lib/claude.ts`): settings
  location (account panel), Vitals pulse rows + grades, Journal gold entries,
  chart rewind — the model no longer directs users to "Profile →
  Preferences".
- Design explorations archived: `docs/design/redesign/pulse-whatif-compact.html`,
  `pulse-voice-plate.html`.

## Known Technical Debt

- **Historical mutations have currency-implicit-EUR values**. Rows logged before the native-storage migration have `before_value`/`after_value` stored as EUR-equivalent even when the position was non-EUR priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP; post-migration rows are correct (native currency matching `currency` column).
- **System prompt is verbose**. At 50+ assets, ~50% token compression is achievable. Not yet implemented.
- ~~**No tests**. Zero unit, integration, or E2E coverage.~~ — **shipped**: per-commit hermetic suite (`npm test`) + manual-trigger model and demo behaviour evals. See "Automated Testing & Chat Behaviour Evals" above.
- ~~**No analytics**~~ — **shipped**: `@vercel/analytics` with 5 pilot events (signup, first_asset_added — now carrying `minutes_since_signup`, first_chat_mutation, return_visit_day2_plus, demo_verdict_seen) plus chip impression/interaction telemetry (`src/lib/chip-telemetry.ts`). See "The First 60 Seconds" above for the two hook metrics.
- **Hardcoded FX fallback rates drift**. Review annually if both DB cache and frankfurter.app fail.
- **Two-write atomicity**. Asset + mutation insert is not a DB transaction. The **add** path now rolls back the orphaned asset if its mutation insert fails (2026-06); a multi-row batch is still per-row best-effort (one bad row reports and skips, doesn't abort the others — intentional). A true all-or-nothing RPC remains unimplemented. Sentry captures failures.
- **UTC "today" off-by-one**. `occurred_at` / sale-date defaults use `new Date().toISOString()` (UTC), so a same-day event near midnight in a far-from-UTC timezone can be dated one day off. Needs the client's local date/timezone passed to the server. Edge-case; deferred.
- **Income-pension access age defaults to 67 (NL)** for every jurisdiction when the user skips it (`DEFAULT_PENSION_ACCESS_AGE`). Affects the "from age X" income display only, not net worth. Deferred.
- **Batch adds sometimes ask the acquisition date before committing** (the prompt says commit-then-ask). Harmless ordering — the positions are added on the next turn — but not the intended instant-add feedback.
- **AAPL logo intermittently 404s from FMP**. Falls back to monogram. Display-only.
- ~~**Compound index on `messages (user_id, created_at DESC)`**~~ — **shipped** in `supabase/migrations/20260520_perf_indices.sql`. Also adds `snapshots(user_id, date DESC)` in the same file.
- **Safari OAuth on localhost** is broken (ITP). Production unaffected.
