# Technical Decisions

## Frontend Stack

- **Next.js 16** (Turbopack) with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Fonts**: Source Serif 4 (serif, hero numbers and section titles), Albert Sans (body, labels, nav). Geist Mono is no longer used in UI chrome. — all loaded from Google Fonts
- **Design tokens** in `src/app/globals.css` (CSS vars) + `tailwind.config.ts` (utilities) + `src/lib/tokens.ts` (TypeScript mirror for inline JS contexts like Recharts)
- No state management library — local React state and custom hooks only
- No component library — custom inline styles using Tailwind utility classes

## Backend / Database Stack

- **Supabase Postgres** with Row Level Security on all user-scoped tables
- **Supabase Auth** for Google OAuth + email magic link
- **Supabase Storage** bucket `property-photos` for cached map snapshots and uploaded property photos (RLS: users can only read/write files prefixed with their own `user_id`)
- **Next.js API routes** for server-side logic (`/api/chat`, `/api/prices`, `/api/fx`, `/api/geocode`, `/api/diary-summary`, `/api/prices/history`, `/api/snapshots`, `/api/cron/snapshot`, `/api/users/me`)
- **Anthropic Claude API** called server-side only (API key never exposed to client)
- **Sentry** for error tracking (server, client, and edge). Free tier covers MVP scale. App runs gracefully when DSN is unset.
- **frankfurter.app** for FX rates (no key, ECB-backed)
- **OpenFreeMap** for property maps (no key, MIT-licensed) via MapLibre GL JS
- **OSM Nominatim** for geocoding (free, rate-limited at 1 req/sec, requires User-Agent header) — only called server-side
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
- `email`, `name`, `avatar_url`
- `profile` (jsonb) — investor profile fields built by `profile-extractor.ts`
- `display_currency` (text, default `'EUR'`, check `in ('EUR', 'USD', 'GBP')`) — per-user display preference. Storage stays EUR-equivalent; this column drives only the rendered string. See `currency-feature-spec.md`. **Added in Phase A of the currency parameterization work; not present until then.**
- `theme` (text, default `'auto'`, check `in ('auto', 'light', 'dark')`) — per-user theme preference. `ThemeProvider` resolves `auto` against `prefers-color-scheme`.
- `avatar_url` is now user-editable via PATCH `/api/users/me` (in addition to being auto-populated from Google OAuth on signup).
- `created_at`, `updated_at`

### assets
Core portfolio table. One row per position.
- `id` (uuid, PK), `user_id` (uuid, FK)
- `name`, `type` (stocks | etf | crypto | bonds | gold | real_estate | cash | pension | other)
- `value` (numeric, EUR-equivalent — for tradeables, server-converted from Yahoo's native currency in `/api/prices`; for non-tradeables, converted at write from the user's display currency. EUR is the canonical storage unit; rendering is per-user via `users.display_currency`. See `currency-feature-spec.md`)
- `currency` (ISO code) — the asset's **native** currency. For tradeables, self-healed from Yahoo. For real estate, captured from property location at add time (Phase D of the currency feature: NL → EUR, US → USD, UK → GBP). For cash / pension / bonds / other, user-stated. Used only as transparency metadata and for FX context — math always runs against `value` in EUR.
- `country` (ISO2), `symbol` (Yahoo Finance ticker), `units`, `buy_price`, `buy_date`, `buy_price_source`
- Real estate fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type`, `mortgage_start_date`, `mortgage_end_date` (mortgage values are EUR-equivalent in storage, in the same currency as the parent property's `value`)
- Property fields: `address`, `latitude`, `longitude`, `photo_url`, `property_type`, `size_sqm`
- Bond fields: `coupon_rate`, `maturity_date`, `issuer`, `isin`
- `created_at`, `updated_at`

### messages
Chat history. Read by `route.ts` to build conversation context (last 6 messages).
- `id`, `user_id`, `role` (user | assistant), `content`, `created_at`

### mutations
Financial diary. Every portfolio change creates a row.
- `id`, `user_id`, `asset_id` (nullable for removed assets), `asset_name`, `asset_type`, `symbol`
- `action` (add | edit | remove)
- `before_value`, `after_value` (numeric, EUR-equivalent)
- `before_units`, `after_units` (numeric, nullable — populated for tradeable mutations starting from the unit-tracking migration; null for real estate, cash, bonds, pension, and historical pre-migration rows)
- `currency` (text, nullable; backfilled from `assets.currency` via `asset_id`, defaulted to `'EUR'` for orphans)
- `personal_context` (extracted from conversation), `market_context` (currently unused)
- `portfolio_total` (snapshot of net worth at time of change)
- `occurred_at` (when the user says it happened), `recorded_at` (when it was logged)

### fx_rates
FX rate cache. One row per currency pair.
- `base` (text, e.g. `'EUR'`)
- `quote` (text, e.g. `'USD'`)
- `rate` (numeric, e.g. `1.177` meaning 1 EUR = 1.177 USD)
- `fetched_at` (timestamptz, defaults to `now()`)
- PK on `(base, quote)`
- Refreshed lazily on first miss with 24-hour TTL

### snapshots
Daily net worth records. Active and writing.
- `id`, `user_id`, `total_value` (numeric, EUR — net worth, not gross), `breakdown` (jsonb keyed by asset type, gross value per type), `date` (date)
- Unique index on `(user_id, date)` enforces one row per user per day; multiple writes same day produce one row, last-write-wins via upsert
- Written by:
  - Daily Vercel cron at midnight UTC (`/api/cron/snapshot`)
  - Fire-and-forget after every successful mutation in `/api/chat`, `/api/assets/[id]` PATCH, `/api/assets/[id]` DELETE
- Shared writer: `src/lib/snapshot.ts` `writeSnapshot(userId)` — never throws, captures errors via Sentry, returns early when user has no assets

### goals
Optional soft goals captured during onboarding.
- `id`, `user_id`, `title`, `target_value`, `target_date`, `created_at`

### highlights
Schema only. Reserved for dashboard highlights feature (planned for after diary improvements).
- `id`, `user_id`, `type`, `title`, `detail`, `impact`, `asset_id`, `created_at`, `expires_at`, `seen`

### date_context
Schema only. Reserved for "on this day" reflections (subset of this is now being built into the diary directly via `mutations.occurred_at` matching, not via this table).
- `date` (PK), `events` (text[]), `cached_at`

## Cron Jobs

Configured in `vercel.json`:
- Daily at `0 0 * * *` (midnight UTC) → `/api/cron/snapshot`
- Authenticated via `CRON_SECRET` environment variable. The route checks `Authorization: Bearer ${process.env.CRON_SECRET}` and returns 401 otherwise.
- Vercel Cron sends the Authorization header automatically with the value of the env var.
- Local testing: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/snapshot`

## AI / Claude Integration Approach

- **Model**: `claude-sonnet-4-6` for the main assistant; `claude-haiku-4-5-20251001` for diary summary and profile extraction
- **Max tokens**: 2000 for main assistant, 160 for diary summary, 500 for profile extraction
- **System prompt** built fresh per request from current portfolio state, profile, and recent mutations (`src/lib/claude.ts`)
- **Two prompt variants**: `buildOnboardingPrompt` (zero assets) and `buildSystemPrompt` (existing portfolio)
- **Conversation history**: last 6 messages from `messages` table, with `<changes>`/`<context>`/`<goal>` tags stripped
- **Image input**: base64 passed through as a content block when user pastes a screenshot
- **Currency in prompt**: `buildStaticSystem(displayCurrency)` and `buildOnboardingPrompt(displayCurrency)` inject a display-currency rendering directive into every prompt. Claude renders prose totals in the user's display currency; the `<changes>` JSON stays native (Yahoo's reported currency for tradeables, country-derived for real estate). The dynamic context block (`buildDynamicContext`) shows EUR-equivalent values with a note telling Claude to render prose in the display currency. Real-estate adds include the `currency` field (NL→EUR, US→USD, UK→GBP) in the few-shot examples. Goal targets stated in display currency include a `currency` field in `<goal>` JSON; the route converts to EUR via `toEur()` before storage. See `currency-feature-spec.md` for full phasing details.
- **`<context>` instruction**: explicitly bans scaffolding language ("auto-filled", "live data", "Yahoo Finance", implementation mechanics). Frames the context as a private banker's ledger note
- **Renaming support**: edit action accepts a `new_name` field separate from the matching `name` field. System prompt explicitly documents this pattern.

### Changes-only architecture
Claude returns small `<changes>` blocks — only what changed, never the full portfolio. Three actions:
- `add` → INSERT into assets (with currency derived from Yahoo when symbol is known, else EUR default)
- `edit` → UPDATE matched by name (case-insensitive). Supports `new_name` for renaming. Supports name field updates server-side (also exposed on PATCH /api/assets/[id]).
- `remove` → DELETE matched by name (case-insensitive)

Every action writes a row to `mutations` with the resolved currency and unit columns where applicable.

### Background profile extraction
After every non-onboarding chat, a separate Claude call analyzes the exchange and updates `users.profile`. Fire-and-forget — never blocks the user response. Costs ~$0.003 per conversation. Also emits a `fingerprint` field — a single-sentence characterization of the user as an investor, 12–18 words, used on the Profile page.

Chat is a single continuous thread per user. `useChatSession`'s 24h localStorage TTL is a cache strategy, not a UX-level session boundary. `GET /api/messages` supports cursor-based pagination (`before=<id>&limit=20`) to lazy-load older history as the user scrolls up.

### Strict topic boundary
The system prompt explicitly tells Claude to refuse off-topic requests with a fixed redirect message. Portfolio and personal finance only.

## Portfolio Calculation Rules

- **Gross total** = sum of all asset values (EUR)
- **Net worth** = sum where real estate assets contribute (value − mortgage_balance) instead of value
- **Equity per real estate asset** = value − mortgage_balance
- **Allocation percentages** are calculated against gross total, not net
- **Concentration warnings** (in `src/app/page.tsx`):
  - Single position > 40% of gross
  - Single asset type > 60% of gross
  - Cash > 30% of gross
  - Only one asset class with multiple positions
- **Milestone steps** scale dynamically against `users.display_currency`. Same numeric pattern across EUR / USD / GBP at launch (1k below 10k, 5k below 50k, 10k below 100k, 50k below 500k, 100k below 1M, 500k below 5M, 1M above) — the symbol changes, the step magnitudes do not. `getMilestoneProgress` takes EUR input and returns display-currency labels. See `currency-feature-spec.md` Phase B.
- All sums assume `value` is in EUR. Live-priced assets are converted server-side in `/api/prices`; manual values (real estate, cash, etc.) are converted at write from the user's display currency to EUR (Phase C of the currency feature). EUR is the canonical storage and math unit; display currency only affects the rendered string.

## Currency Rules

- **Storage**: EUR-equivalent on every numeric column in `assets`, `snapshots`, `mutations`, `goals`. Non-negotiable.
- **FX pivot**: EUR. `fx_rates.base = 'EUR'` always. frankfurter.app is ECB-anchored, EUR is the natural pivot. All conversions go `native → EUR` at write and `EUR → display` at render.
- **Display**: per-user via `users.display_currency` (EUR / USD / GBP at launch). Every component renders money via `formatMoney(eurValue, displayCurrency)` from `src/lib/money.ts` (added in Phase A).
- **Inputs**: manual entries (inline edits on detail pages, mortgage fields, goal targets) accept display currency and convert to EUR at write client-side. Server stays EUR-only.
- **Real estate native currency**: each property carries its native currency on `assets.currency` (NL → EUR, US → USD, UK → GBP). Stored as transparency metadata; math always runs against the EUR-equivalent `value`. Captured at add time in Phase D.
- **Math**: allocation percentages, concentration thresholds (40% / 60% / 30%), snapshot totals, mutation values, milestone math — all in EUR. Display currency never enters the math layer.
- **Claude prompts**: `buildSystemPrompt` and `buildOnboardingPrompt` are parameterized with `displayCurrency` (Phase C). Prose responses render in display currency; `<changes>` JSON stays native. Banker's-note `<context>` strings are written in display currency.
- **Existing user default**: `EUR`. No retroactive rewriting of past Claude responses or diary entries when display currency changes.

## Snapshot Calculation Rules

- `total_value` = net worth (real estate contributes equity, not gross)
- `breakdown` = jsonb keyed by asset type, summing gross `value` per type (so allocation views computed against breakdown match the rest of the app)
- Computed in `src/lib/snapshot.ts` from current asset state at write time
- Cron and inline triggers use the same writer — no logic duplication

## Mutation / Diary Logging Rules

- Every `add`, `edit`, `remove` action in `/api/chat` writes a row to `mutations`
- `add` actions are dedup-checked before INSERT: case-insensitive symbol match if symbol present, else case-insensitive name match. Duplicates are rejected and surfaced conversationally so the assistant can clarify with the user (update vs rename)
- `currency` is recorded alongside the value, derived from the resolved asset currency at write time
- `before_units` / `after_units` are recorded for tradeable mutations only — null for real estate, cash, bonds, pension. Diary display logic prefers unit-based deltas when these columns are populated
- `personal_context` comes from the optional `<context>` block returned by Claude; banker's-note style enforced via system prompt
- `portfolio_total` is captured at the moment of mutation
- `occurred_at` defaults to today; Claude uses `buy_date` for adds when known
- Pure renames (chat or UI edits where the only diff is the asset name) do not create a `mutations` row. The asset UPDATE still runs.
- `personal_context` is write-once. Captured at the moment of mutation, never edited afterward.
- Diary display reads asset names from current `assets.name` via LEFT JOIN; `mutations.asset_name` is the fallback for deleted assets only.

## Price Fetching and Currency Conversion

- Server-side proxy at `/api/prices` to avoid CORS
- Batches all symbols in one request to Yahoo Finance v8 quote endpoint
- For each result, converts native price (and `previousClose`) to EUR using `toEur()` from `/api/fx/route.ts`
- Returns `{ symbol, price (EUR), previousClose (EUR), nativePrice, nativeCurrency }`
- 5-minute in-process price cache; 60s in-process FX memo cache; 24h `fx_rates` table TTL
- FX resolution order: DB cache (within 24h) → frankfurter.app live fetch → hardcoded fallback rates (last-resort, ±10% acceptable, drift over time, review annually)
- `nativePrice` and `nativeCurrency` are carried onto `LiveAsset` for asset detail "transparency" display
- Self-heal: when `nativeCurrency` differs from `assets.currency`, both the currency tag and the freshly-converted EUR `value` are written back in the same operation
- `normalizePrice()` in `src/lib/prices.ts` retains its sole responsibility of handling Yahoo's GBp → GBP penny quirk; FX is no longer this file's concern
- Frontend hook `useAssets` consumes pre-converted EUR prices; no client-side conversion logic
- Cached in component state, refreshed manually via the Refresh button. No automatic refresh interval

## Asset Logo Resolution

- Shared `AssetLogo` component handles all logo rendering across DiaryTab and PositionRow
- Three-tier resolution:
  1. **Crypto**: client points at `/api/logo?type=crypto&symbol={base}` (symbol strips `-USD` / `-EUR` suffixes). Server fetches from `https://cdn.jsdelivr.net/npm/cryptocurrency-icons/svg/color/{base}.svg`.
  2. **Stocks/ETFs**: client points at `/api/logo?type=stock&symbol={symbol}`. Server fetches from `https://images.financialmodelingprep.com/symbol/{symbol}.png`. ETF and stock collapse into the same `type=stock` proxy path — FMP serves both from the same endpoint.
  3. **Real estate**: hand-rolled inline SVG icons by `property_type` (house, apartment, office, land, other). Stroke-based, matches design tokens.
- `/api/logo` route: validates `type` (must be `crypto` or `stock`) and `symbol` (regex `/^[A-Za-z0-9.\-]+$/`, max 16 chars) — rejects with 400 on bad input, blocking path-traversal and SSRF. Fetches upstream with a 5-second AbortController timeout. On non-2xx or timeout, returns 404; `AssetLogo.onError` falls back to monogram.
- In-process cache: `Map<string, { bytes, contentType, fetchedAt }>` at module scope. TTL 7 days. FIFO eviction at 500 entries (Map insertion order, delete oldest on overflow). Logos are essentially immutable — LRU bookkeeping is overkill.
- `Cache-Control: public, max-age=604800, immutable` on every proxy response — browser caches locally, proxy hit is minimal after first fetch per logo.
- Fallback: existing colored monogram badge for any image load failure or asset types without logo coverage (gold, bonds, cash, pension, other)
- Wrapper: rounded square with bg-surface and border. Border dropped for crypto and stock variants.
- onError handler swaps to monogram via React state. No retry.

## Authentication Assumptions

- Supabase Auth handles sessions via secure cookies
- `middleware.ts` checks the session on every protected route and redirects to `/login` if absent
- The `users` table is auto-populated by a Supabase trigger on `auth.users` insert
- Service role key (`SUPABASE_SERVICE_ROLE_KEY`) is used server-side in API routes for privileged operations
- Anon key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`) is used client-side, RLS enforces user scope

### URL Configuration
- Site URL in Supabase: `https://app.novahub.nl`
- Redirect URLs allow both production and `http://localhost:3000/auth/callback` for local dev
- Google OAuth redirect URI in Google Cloud Console: `https://cbcpzftelyqgmbawbrpo.supabase.co/auth/v1/callback`

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public anon key for client-side
- `SUPABASE_SERVICE_ROLE_KEY` — service role key for server-side privileged operations
- `ANTHROPIC_API_KEY` — Claude API key
- `CRON_SECRET` — protects `/api/cron/*` endpoints. Vercel Cron sends as `Authorization: Bearer <value>`
- `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` — error tracking, optional (app runs cleanly without)

## User preferences endpoint

`PATCH /api/users/me` accepts an allowlist of `display_currency`, `theme`, and `avatar_url`. Field-level allowlist; unknown fields rejected with 400.

## Mortgage current balance

`computeCurrentBalance(asset, asOf = today)` in `src/lib/mortgage.ts` computes today's balance using the amortization formula from the stored anchor (`mortgage_balance` + `mortgage_start_date` + rate + payment + type). Read sites (`MortgageBlock`, `RealEstateDetail`) go through the helper rather than reading `assets.mortgage_balance` directly. `assets.mortgage_balance` stores the balance at the most recent anchor (initial setup or recalibration via stated balance correction). No cron job. Same amortization formula serves both current balance and the future payoff projection chart.

## Theme

`users.theme` column (auto / light / dark, default auto). `ThemeProvider` resolves auto against `prefers-color-scheme`. Cookie set on theme change so SSR renders the correct `data-theme` attribute on `<html>`. Picker lives on the Profile page; no separate settings route.

## Known Technical Debt

- **Historical mutations have currency-implicit-EUR values**. Rows logged before the currency normalization fix have `before_value` and `after_value` stored as if EUR even when the position was non-EUR priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP.
- **`before_value` / `after_value` semantic muddle on mutations**. Stored as EUR-equivalents but `currency` is native. Pre-existing inconsistency, separate redesign needed.
- **System prompt is verbose**. At 50+ assets, ~50% token compression is achievable. Not yet implemented.
- **Cosmetic warnings** in dev mode: middleware deprecation, multiple lockfiles. Functional, can be ignored.
- **No tests**. Zero unit, integration, or E2E coverage. Acceptable for MVP, will become a problem as feature surface grows.
- **No analytics**. No PostHog, no Mixpanel. No usage data being captured. Defer until user count justifies it.
- **Hardcoded FX fallback rates drift**. If both DB cache and frankfurter.app fail, the app uses approximate hardcoded rates. Review annually.
- **Two-write atomicity**. Asset update + mutation insert is not transactional. Sentry captures failures.
