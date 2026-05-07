# Technical Decisions

## Frontend Stack

- **Next.js 16** (Turbopack) with App Router
- **React** with TypeScript
- **Tailwind CSS** for styling
- **Plus Jakarta Sans** as the primary font (loaded from Google Fonts)
- No state management library — local React state and custom hooks only
- No component library — custom inline styles using Tailwind utility classes

## Backend / Database Stack

- **Supabase Postgres** with Row Level Security on all user-scoped tables
- **Supabase Auth** for Google OAuth + email magic link
- **Next.js API routes** for server-side logic (`/api/chat`, `/api/prices`)
- **Anthropic Claude API** called server-side only (API key never exposed to client)
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
- `value` (numeric, in EUR — uncertain for non-EUR assets), `currency`
- `country` (ISO2), `symbol` (Yahoo Finance ticker), `units`, `buy_price`, `buy_date`, `buy_price_source`
- Real estate fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type`, `mortgage_start_date`, `mortgage_end_date`
- `created_at`, `updated_at`

### messages
Chat history. Read by route.ts to build conversation context (last 6 messages).
- `id`, `user_id`, `role` (user | assistant), `content`, `created_at`

### mutations
Financial diary. Every portfolio change creates a row.
- `id`, `user_id`, `asset_id` (nullable for removed assets), `asset_name`
- `action` (add | edit | remove)
- `before_value`, `after_value`
- `personal_context` (extracted from conversation), `market_context` (currently unused)
- `portfolio_total` (snapshot of net worth at time of change)
- `occurred_at` (when the user says it happened), `recorded_at` (when it was logged)

### snapshots
Schema only. No data being written. Reserved for future net-worth-over-time chart.
- `id`, `user_id`, `total_value`, `breakdown` (jsonb), `date`

### goals
Optional soft goals captured during onboarding.
- `id`, `user_id`, `title`, `target_value`, `target_date`, `created_at`

### highlights
Schema only. Reserved for dashboard highlights feature (not yet built).
- `id`, `user_id`, `type`, `title`, `detail`, `impact`, `asset_id`, `created_at`, `expires_at`, `seen`

### date_context
Schema only. Reserved for "on this day" reflections (not yet built).
- `date` (PK), `events` (text[]), `cached_at`

## AI / Claude Integration Approach

- **Model**: `claude-sonnet-4-6`
- **Max tokens**: 2000
- **System prompt** built fresh per request from current portfolio state, profile, and recent mutations (`src/lib/claude.ts`)
- **Two prompt variants**: `buildOnboardingPrompt` (zero assets) and `buildSystemPrompt` (existing portfolio)
- **Conversation history**: last 6 messages from `messages` table, with `<changes>`/`<context>`/`<goal>` tags stripped
- **Image input**: base64 passed through as a content block when user pastes a screenshot

### Changes-only architecture
Claude returns small `<changes>` blocks — only what changed, never the full portfolio. Three actions:
- `add` → INSERT into assets
- `edit` → UPDATE matched by name (case-insensitive)
- `remove` → DELETE matched by name (case-insensitive)

This keeps responses small and avoids token-limit truncation on large portfolios.

### Background profile extraction
After every non-onboarding chat, a separate Claude call analyzes the exchange and updates `users.profile`. Fire-and-forget — never blocks the user response. Costs ~$0.003 per conversation.

### Strict topic boundary
The system prompt explicitly tells Claude to refuse off-topic requests with a fixed redirect message. Portfolio and personal finance only.

## Portfolio Calculation Rules

- **Gross total** = sum of all asset values
- **Net worth** = sum where real estate assets contribute (value − mortgage_balance) instead of value
- **Equity per real estate asset** = value − mortgage_balance
- **Allocation percentages** are calculated against gross total, not net
- **Concentration warnings** (in `src/app/page.tsx`):
  - Single position > 40% of gross
  - Single asset type > 60% of gross
  - Cash > 30% of gross
  - Only one asset class with multiple positions
- **Milestone steps** (in `src/lib/projection.ts`) scale dynamically: €1k below €10k, €5k below €50k, €10k below €100k, €50k below €500k, €100k below €1M, €500k below €5M, €1M above

## Mutation / Diary Logging Rules

- Every `add`, `edit`, `remove` action in `/api/chat` writes a row to `mutations`
- `personal_context` comes from the optional `<context>` block returned by Claude
- `portfolio_total` is captured at the moment of mutation (snapshot of net worth)
- `occurred_at` defaults to today; Claude uses `buy_date` for adds when known
- **Currently no mutation logging for manual UI changes — there is no manual UI for asset CRUD yet**

## Price Fetching Approach

- Server-side proxy at `/api/prices` to avoid CORS
- Batches all symbols in one request to Yahoo Finance v8 quote endpoint
- Returns `{ symbol, price, previousClose, currency }` per ticker
- Frontend hook `useAssets` merges live prices into asset objects as `livePrice` and `livePrev`
- **Currency conversion is not performed** — Yahoo returns native currency, frontend treats all values as EUR (uncertain, see `current-features.md`)
- Cached in component state, refreshed manually via the Refresh button
- No automatic refresh interval

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

## Known Technical Debt

- **No FX conversion layer**. All values assumed EUR. Mixed-currency portfolios will show wrong totals.
- **No deduplication on insert**. Adding "AAPL" twice creates two rows.
- **No manual asset CRUD UI**. All edits go through the chat assistant.
- **No daily snapshot job**. The `snapshots` table is empty.
- **No mutation log for non-AI changes**. If manual CRUD is added, the logging rule must be enforced there too.
- **System prompt is verbose**. At 50+ assets, ~50% token compression is achievable. Not yet implemented.
- **Cosmetic warnings** in dev mode: middleware deprecation, multiple lockfiles. Functional, can be ignored.
- **No tests**. Zero unit, integration, or E2E coverage. Acceptable for MVP, will become a problem.
- **No error tracking**. No Sentry, no LogRocket. Errors only visible in Vercel logs.
- **No analytics**. No PostHog, no Mixpanel. No usage data being captured.
