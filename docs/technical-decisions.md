# Technical Decisions

## Frontend Stack

- **Next.js 16** (Turbopack) with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Fonts**: Fraunces (serif, hero numbers), Plus Jakarta Sans (body), Geist Mono (financial figures, dates, metadata) — all loaded from Google Fonts
- **Design tokens** in `src/app/globals.css` (CSS vars) + `tailwind.config.ts` (utilities) + `src/lib/tokens.ts` (TypeScript mirror for inline JS contexts like Recharts)
- No state management library — local React state and custom hooks only
- No component library — custom inline styles using Tailwind utility classes

## Backend / Database Stack

- **Supabase Postgres** with Row Level Security on all user-scoped tables
- **Supabase Auth** for Google OAuth + email magic link
- **Supabase Storage** bucket `property-photos` for cached map snapshots and uploaded property photos (RLS: users can only read/write files prefixed with their own `user_id`)
- **Next.js API routes** for server-side logic (`/api/chat`, `/api/prices`, `/api/fx`, `/api/geocode`, `/api/diary-summary`, `/api/prices/history`, `/api/snapshots`, `/api/cron/snapshot`, `/api/assets/[id]`, `/api/mutations/[id]`)
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
- `created_at`, `updated_at`

### assets
Core portfolio table. One row per position.
- `id` (uuid, PK), `user_id` (uuid, FK)
- `name`, `type` (stocks | etf | crypto | bonds | gold | real_estate | cash | pension | other)
- `value` (numeric, EUR — converted server-side from Yahoo's native currency for live-priced assets), `currency` (ISO code, self-healed from Yahoo)
- `country` (ISO2), `symbol` (Yahoo Finance ticker), `units`, `buy_price`, `buy_date`, `buy_price_source`
- Real estate fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type`, `mortgage_start_date`, `mortgage_end_date`
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
- **Currency in prompt**: parameterized — `value` field description uses native-currency language; few-shot examples carry the correct currencies (`"currency":"USD"` for US tickers); `buildDynamicContext` shows per-asset currency and appends a `currency:USD` hint for non-EUR assets
- **`<context>` instruction**: explicitly bans scaffolding language ("auto-filled", "live data", "Yahoo Finance", implementation mechanics). Frames the context as a private banker's ledger note
- **Renaming support**: edit action accepts a `new_name` field separate from the matching `name` field. System prompt explicitly documents this pattern.

### Changes-only architecture
Claude returns small `<changes>` blocks — only what changed, never the full portfolio. Three actions:
- `add` → INSERT into assets (with currency derived from Yahoo when symbol is known, else EUR default)
- `edit` → UPDATE matched by name (case-insensitive). Supports `new_name` for renaming. Supports name field updates server-side (also exposed on PATCH /api/assets/[id]).
- `remove` → DELETE matched by name (case-insensitive)

Every action writes a row to `mutations` with the resolved currency and unit columns where applicable.

### Background profile extraction
After every non-onboarding chat, a separate Claude call analyzes the exchange and updates `users.profile`. Fire-and-forget — never blocks the user response. Costs ~$0.003 per conversation.

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
- **Milestone steps** scale dynamically: €1k below €10k, €5k below €50k, €10k below €100k, €50k below €500k, €100k below €1M, €500k below €5M, €1M above
- All sums assume `value` is in EUR. Live-priced assets are converted server-side; manual values (real estate, cash, etc.) are entered in EUR by the user

## Snapshot Calculation Rules

- `total_value` = net worth (real estate contributes equity, not gross)
- `breakdown` = jsonb keyed by asset type, summing gross `value` per type (so allocation views computed against breakdown match the rest of the app)
- Computed in `src/lib/snapshot.ts` from current asset state at write time
- Cron and inline triggers use the same writer — no logic duplication

## Mutation / Diary Logging Rules

- Every `add`, `edit`, `remove` action in `/api/chat` writes a row to `mutations`
- Manual UI changes via PATCH/DELETE on `/api/assets/[id]` also write rows using the same schema
- `add` actions are dedup-checked before INSERT: case-insensitive symbol match if symbol present, else case-insensitive name match. Duplicates are rejected and surfaced conversationally so the assistant can clarify with the user (update vs rename)
- `currency` is recorded alongside the value, derived from the resolved asset currency at write time
- `before_units` / `after_units` are recorded for tradeable mutations only — null for real estate, cash, bonds, pension. Diary display logic prefers unit-based deltas when these columns are populated
- `personal_context` comes from the optional `<context>` block returned by Claude (chat path) or null on inline UI changes; banker's-note style enforced via system prompt
- `portfolio_total` is captured at the moment of mutation
- `occurred_at` defaults to today; Claude uses `buy_date` for adds when known
- `PATCH /api/mutations/[id]` allows updating `personal_context` only; all other fields are rejected with 400

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
  1. **Crypto**: cryptocurrency-icons via jsdelivr CDN (`https://cdn.jsdelivr.net/npm/cryptocurrency-icons/svg/color/{base}.svg`). Symbol mapping strips `-USD` / `-EUR` suffixes.
  2. **Stocks/ETFs**: Financial Modeling Prep image endpoint (`https://images.financialmodelingprep.com/symbol/{symbol}.png`). Free, no API key.
  3. **Real estate**: hand-rolled inline SVG icons by `property_type` (house, apartment, office, land, other). Stroke-based, matches design tokens.
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

## Known Technical Debt

- **Historical mutations have currency-implicit-EUR values**. Cannot be retroactively converted without historical FX rates per `occurred_at`.
- **`before_value` / `after_value` semantic muddle on mutations**. Stored as EUR-equivalents but `currency` is native. Pre-existing inconsistency, separate redesign needed.
- **System prompt is verbose**. At 50+ assets, ~50% token compression is achievable. Not yet implemented.
- **AssetLogo CDN privacy debt**. Loading from external CDNs leaks user holdings. Fix: proxy through `/api/logo`.
- **Cosmetic warnings** in dev mode: middleware deprecation, multiple lockfiles. Functional, can be ignored.
- **No tests**. Zero unit, integration, or E2E coverage. Acceptable for MVP, will become a problem as feature surface grows.
- **No analytics**. No PostHog, no Mixpanel. No usage data being captured. Defer until user count justifies it.
- **Hardcoded FX fallback rates drift**. If both DB cache and frankfurter.app fail, the app uses approximate hardcoded rates. Review annually.
- **Two-write atomicity**. Asset update + mutation insert is not transactional. Sentry captures failures.
