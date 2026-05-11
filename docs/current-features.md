# Current Features

## Implemented and Working

### Authentication
- **Google OAuth** via Supabase Auth
- **Email magic link** as fallback
- **Session management** via cookies
- **Middleware route protection** redirects unauthenticated users to /login
- **Auto-creates user record** on first signup via Supabase trigger
- Files: `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

### Mobile-First Route Architecture
- Phase 3 of the redesign split the single-page-with-tabs into four routes
- `/` (Portfolio), `/diary`, `/chat`, `/profile`, plus `/asset/[id]` for detail pages
- `BottomNav` component renders on mobile (under 768px), hidden on desktop
- Active tab highlighted in amber via `usePathname()`
- Browser back button and direct linking work across all four
- On desktop, the chat route falls back to the floating `ChatPopup` widget pattern
- BottomNav now renders on `/chat` (was previously suppressed on this route to avoid overlapping the input bar). Layout uses `height: 100dvh` and `padding-bottom: calc(64px + env(safe-area-inset-bottom))` to keep the nav fixed at the viewport bottom while correctly handling iOS safe area and keyboard behavior. `scrollbar-gutter: stable` on body prevents horizontal layout shift when page-level scrollbars appear
- Files: `src/app/page.tsx`, `src/app/diary/page.tsx`, `src/app/chat/page.tsx`, `src/app/profile/page.tsx`, `src/app/asset/[id]/page.tsx`, `src/components/BottomNav.tsx`

### Portfolio Dashboard
- Header: avatar and user name on the left (avatar from `users.avatar_url`, falls back to two-letter initials; name pulled from Supabase auth metadata, falls back to email prefix before `@`, hidden if neither is available — never "User" or "Anonymous"); refresh button with an integrated 4 px status dot (green = all prices live, amber = partial, faint = none) on the right. No settings entry point on Portfolio.
- Net worth hero in serif (Source Serif 4) with intentionally dimmed currency prefix per design spec
- Change pill on the hero showing % and EUR delta vs 1 month ago — only renders when historical snapshot data exists
- Net worth over time chart between hero and allocation cards — range pills (1W / 1M / 3M / 1Y / ALL), smooth bezier line, amber up / coral down, today marker, 7-snapshot empty state
- Allocation card (separate from hero) with "Allocation / DETAILS" header — DETAILS scrolls to the Positions section below
- Segmented allocation bar with allocation breakdown by asset type, percentage and absolute value, colored dots match the bar
- Gross / debt subtitle on hero when mortgages exist
- Concentration warning card (amber outline) when triggered
- Milestone progress bar with dynamic step sizing
- Stat cards (Positions, Countries, Asset classes, Largest) — removed; data was either noise (raw counts) or already conveyed by the allocation bar. See next-build-plan.md Post-MVP / Future for the replacement plan
- Recent activity preview (last 3 mutations)
- Files: `src/app/page.tsx`, `src/components/PortfolioTab.tsx`, `src/components/NetWorthHero.tsx`, `src/components/NetWorthChart.tsx`, `src/components/AllocationBar.tsx`, `src/components/PositionRow.tsx`, `src/components/MiniSparkline.tsx`

### Daily Snapshots & Net Worth Trend
- Vercel cron writes daily snapshots at midnight UTC, secured via `CRON_SECRET` header
- `writeSnapshot()` shared writer also fires fire-and-forget on every successful mutation (chat API, asset PATCH, asset DELETE) so the chart stays fresh between cron runs
- Idempotent upsert on `(user_id, date)` — multiple writes same day produce one row, last value wins
- Net worth chart on Portfolio tab consumes via `/api/snapshots?range=...`, with the live current value appended to the rightmost point
- Files: `src/app/api/cron/snapshot/route.ts`, `src/app/api/snapshots/route.ts`, `src/lib/snapshot.ts`, `vercel.json`

### Asset Detail Pages (Read-Only)
- Three layout variants dispatched by asset type from `src/app/asset/[id]/page.tsx`
- Top bar carries a back chevron (left) and a refresh icon (right, where applicable — Tradeable only, since Real Estate and Static have no live price). Back returns to the previous route, distinct from tapping the Portfolio tab.

**Tradeable** (stocks, ETFs, crypto, gold):
- Icon, big EUR price, change pill, time-range tabs (1D/1W/1M/3M/1Y/ALL), full price chart
- Metric grid: units, avg buy, live price, total return — read-only
- Recent activity scoped to the asset, prefers unit-based deltas ("+5 shares") over value-based for tradeable mutations
- Crypto positions show 24h volatility block; stocks do not
- Crypto positions hide the country field

**Real Estate** — property hub with:
- Map (PropertyMap auto-caches first render as PNG to Supabase Storage)
- Equity hero (computed: value − mortgage_balance), property value row
- Value composition bar (equity vs mortgage)
- MortgageBlock with payoff projection chart and TODAY marker — read-only
- Scoped activity timeline
- Street View access via single pill in photo overlay (no longer duplicated next to address)

**Static** (cash, pension, bonds, other):
- Minimal layout — balance hero, optional currency code, scoped activity
- Bonds get an additional `BondBlock` with issuer, coupon_rate, maturity_date, isin

- All asset modifications happen via chat. The bottom-nav Chat tab is context-aware when on /asset/[id] — tapping it opens chat seeded with the asset as context.
- Files: `src/components/asset-detail/{TradeableDetail,RealEstateDetail,StaticDetail,CryptoVolatilityBlock,BondBlock}.tsx`, `src/components/PriceChart.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`

### Real Estate & Mortgage Tracking
- Properties stored as assets with `type = 'real_estate'`
- Mortgage fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type` (annuity/linear/interest_only), `mortgage_start_date`, `mortgage_end_date`
- Property fields (Phase 5): `address`, `latitude`, `longitude`, `photo_url`, `property_type`, `size_sqm`
- Equity calculated as `value − mortgage_balance`. Net worth uses equity, not gross
- `MortgageBlock` shows balance, rate, monthly payment, type, payoff projection chart with TODAY marker, sub-stats (paid to date, interest paid, time remaining, mortgage-free date) — all editable inline
- Linear mortgages render a straight line; interest-only mortgages show "—" for mortgage-free date
- `PropertyMap` renders OpenFreeMap with MapLibre GL JS, custom dark style matching design tokens, amber pin at lat/lng. After first render, captures `map.getCanvas().toDataURL()` and uploads to `property-photos/<user_id>/<asset_id>.png` so subsequent loads serve a cached image
- Empty state: when `latitude` / `longitude` are null, renders a styled placeholder with "Add address" affordance instead of a broken image
- Address geocoding via OSM Nominatim, structured query format (`street=`, `city=`, `country=`) for precision. Re-runs whenever `address` changes (server-side from PATCH /api/assets/[id] — geocoding never happens client-side)
- Country-agnostic — pure math, no tax assumptions
- Files: `src/components/asset-detail/RealEstateDetail.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/lib/mortgage.ts`, `src/lib/maps.ts`, `src/app/api/geocode/route.ts`, `src/lib/geocode.ts`

### Real-time Prices with Currency Conversion
- Yahoo Finance via server-side API route at `/api/prices`
- Server-side conversion to EUR using cached FX rates from `fx_rates` table
- Returns `{ price (EUR), previousClose (EUR), nativePrice, nativeCurrency }` per symbol
- FX cache refreshed lazily on first miss with 24h TTL via `/api/fx`. In-process 60s memo cache layer prevents redundant table hits during active polling
- FX source: frankfurter.app (no key, ECB-backed). EUR base matches the display plan
- Self-heal: when Yahoo's reported currency differs from `assets.currency`, the row is corrected on next price refresh — currency tag and freshly-converted EUR value updated together in the same write
- Live/offline indicator in nav as a colored dot (green = all live, amber = partial, faint = none)
- Manual refresh button
- Day-change badges per position; previous-close is also EUR-converted for like-for-like comparison
- Files: `src/app/api/prices/route.ts`, `src/app/api/fx/route.ts`, `src/lib/hooks.ts` (`useAssets`, `useLivePrice`)

### Asset Logos
- Shared `AssetLogo` component used in both DiaryTab and PositionRow
- Three-tier resolution: crypto and stocks/ETFs fetched via `/api/logo?type=...&symbol=...` proxy (server fetches from upstream once and serves cached bytes thereafter); real estate via inline SVG icons by property_type (house, apartment, office, land, other)
- Proxy route caches responses in-process for 7 days, FIFO eviction at 500 entries. Upstream sources: jsdelivr cryptocurrency-icons for crypto, Financial Modeling Prep for stocks/ETFs. CDN sees Vercel's edge IP, not the user's IP.
- Falls back to colored monogram badge on any image load failure (proxy returns 404 on upstream error) or asset types without logo coverage (gold, bonds, cash, pension)
- Wrapper: rounded square with bg-surface and border (border dropped for crypto and stock variants since their logos carry their own visual weight)
- Files: `src/components/AssetLogo.tsx`, `src/app/api/logo/route.ts`

### Concentration Warnings
- Single position > 40% of gross
- Single asset type > 60% of gross
- Cash > 30%
- Only one asset class with multiple positions
- Displayed as amber-outlined card above stats
- Files: `src/app/page.tsx` (`getWarnings`)

### Milestone Progress Bar
- Dynamic step sizing scales with portfolio size (1k below 10k, 5k below 50k, 10k below 100k, 50k below 500k, 100k below 1M, 500k below 5M, 1M above)
- Single thin progress bar — no charts, no goal editor
- Currency-aware: `getMilestoneProgress(eurTotal, displayCurrency)` converts to display currency before applying step logic and labels
- Files: `src/lib/projection.ts`

### Display Currency Parameterization (Phases A–D shipped)
- Per-user display currency stored on `users.display_currency` (EUR / USD / GBP, default EUR). Picker lives on the Profile page under Preferences (superseded the `/settings` route from Phase A — see `redesign-decisions.md` Decision 5 and PR 3).
- Storage stays EUR on every numeric column. FX pivot: EUR via frankfurter.app (ECB-backed).
- **Phase A**: `formatMoney(eurValue, displayCurrency)`, `formatMoneyParts`, `useDisplayCurrency()`, `PATCH /api/users/me`.
- **Phase B**: Every visible number (hero, allocation, positions, milestones, diary, all detail pages) renders in display currency via `formatMoney`. `PriceDisplay` extended with `displayCurrency` prop for editorial superscript styling. First-switch toast ("Display only — your portfolio is unchanged.") appears once, tracked in localStorage.
- **Phase C**: Inline edit inputs accept display currency and convert to EUR at write via `convertToEur()`. FX freshness state machine (`fresh` / `stale` / `unavailable`) — `unavailable` blocks the write, `stale` warns inline but allows. `buildStaticSystem(displayCurrency)` and `buildOnboardingPrompt(displayCurrency)` parameterize Claude prompts; prose responses render in display currency, `<changes>` JSON stays native. Goal targets stated in display currency are converted to EUR before storage via server-side `toEur()`. Diary summary Haiku prompt and context lines are in display currency.
- **Phase D**: Real estate native currency captured at add time from the property's country (NL→EUR, US→USD, UK/GB→GBP, other→EUR). `countryToCurrency()` helper in `src/lib/country-currency.ts`. For non-EUR properties, the value, `mortgage_balance`, and `monthly_payment` from Claude's `<changes>` block are converted from native to EUR before INSERT. `assets.currency` records the native currency. Property detail page shows a "Native: GBP" subtitle for transparency. Existing rows (currency='EUR' or null) are unchanged — no backfill.
- Files: `src/lib/money.ts`, `src/lib/hooks.ts` (`useDisplayCurrency`, `useFxRate`), `src/lib/projection.ts`, `src/lib/claude.ts`, `src/lib/apply-changes.ts`, `src/lib/country-currency.ts`, `src/components/PriceDisplay.tsx`, `src/components/NetWorthHero.tsx`, `src/components/AllocationBar.tsx`, `src/components/PositionRow.tsx`, `src/components/PortfolioTab.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/components/asset-detail/{BondBlock,TradeableDetail,RealEstateDetail,StaticDetail}.tsx`, `src/components/DiaryTab.tsx`, `src/app/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/diary-summary/route.ts`

### Conversational Assistant
- Mobile: full-page route at `/chat` with a 4-suggestion empty state
- Desktop: floating popup (`ChatPopup`)
- Image paste support (Claude vision reads broker app screenshots)
- Changes-only architecture — Claude returns `<changes>` block with only what changed (add/edit/remove), not the full portfolio
- Three actions parsed by backend: add (INSERT), edit (UPDATE by name match, case-insensitive, supports `new_name` field for renaming), remove (DELETE by name match, case-insensitive)
- Edit mutations now propagate a user-stated `buy_date` from Claude's `<changes>` block to `mutations.occurred_at`, matching add-action behavior. Previously edit mutations always wrote `occurred_at = today`
- Currency on insert: derived from Yahoo's reported currency when symbol is known, else EUR default
- Strict topic boundary in system prompt — declines off-topic requests with a fixed redirect
- Rate limit: 50 messages per user per day
- Input cap: 500 characters
- Auto-retry on Claude API failure (3 attempts with backoff)
- Chat history falls back to DB on cold load: `useChatSession` reads localStorage first (24h TTL); on miss or expiry, issues a single `GET /api/messages?limit=20` and populates the initial message state; the fetched messages are written back to localStorage with a fresh timestamp. Resolves cross-device empty history and the post-24h disorientation where Claude references a prior conversation the UI has already forgotten
- Chat is a single continuous thread per user. No 'new chat' or 'session history' UI is exposed. Users scroll back to revisit older exchanges. `useChatSession`'s 24h localStorage TTL is a cache strategy, not a session boundary. `GET /api/messages` supports cursor-based pagination (`before=<id>&limit=20`) for scroll-back.
- Files: `src/components/ChatPopup.tsx`, `src/app/chat/page.tsx`, `src/app/api/chat/route.ts`, `src/app/api/messages/route.ts`, `src/lib/claude.ts`, `src/lib/use-chat-session.ts`

### Portfolio Change Validation
- Server-side validation in `src/lib/validations.ts`, invoked from `/api/chat` after JSON parsing and before any database write
- All-or-nothing: if any change in a multi-change turn fails validation, the entire turn is rejected — no partial writes, no mutation rows logged
- Rules: edit with resulting units below zero is blocked; edit with resulting value below zero is blocked; add with non-positive units or negative value is blocked; remove is unconditionally allowed
- Float tolerance of `1e-9` applied to all unit comparisons to absorb floating-point drift on fractional crypto positions (e.g. closing a position held as 0.100000000001 units)
- Error messages use banker's tone: negative-position edits name the asset and describe the attempted sell quantity; negative-value edits prompt the user to close explicitly; invalid adds give a generic size check; no apology language
- On validation failure the error message is saved to the `messages` table as the assistant turn and returned as the API response — Claude is not called again
- `PATCH /api/assets/[id]` (manual UI edit path) does not yet apply these checks — direct asset edits bypass validation; parity there is a identified future improvement, not implemented in this pass
- Files: `src/lib/validations.ts` (new), `src/app/api/chat/route.ts`

### Conversational Onboarding
- Triggers when user has zero assets
- Three-step flow: assets first, anything else, optional soft goal
- "Just keeping track" accepted as valid goal answer
- Mentions screenshot capability during step 1
- Files: `src/lib/claude.ts` (`buildOnboardingPrompt`), routed in `src/app/api/chat/route.ts`

### Financial Diary
- Every add/edit/remove via chat or inline UI creates a row in `mutations`
- Captured fields: action, before_value, after_value, currency, before_units, after_units, asset_type, symbol, personal_context, portfolio_total, occurred_at, recorded_at
- For tradeable mutations (stocks/etf/crypto/gold), display prefers unit-based deltas ("+5 shares", "−2 shares", "+0.5 units") over value-based deltas. Falls back to value-based for real estate, cash, bonds, pension, and historical mutations with null unit columns
- Date format drops the year for current-year entries (just "8 May" instead of "8 May 2026")
- Compact two-line entry layout: icon + name + delta + date on row 1, optional context note on row 2 (line-clamped)
- Real asset logos via AssetLogo (crypto from cryptocurrency-icons, stocks from FMP, real estate by property type, monogram fallback)
- Action signaling now comes from value pattern itself (no action tag pill): green for adds, signed delta for edits, strikethrough for removes
- Filter section: period chip row with abbreviated labels matching the chart range selectors (ALL / 1W / 1M / 3M / 1Y / Custom) — no action filter pills, no count cards, no big numbers. When Custom is selected, the date range picker renders on a sub-row directly below the chips (styled selects, same chip aesthetic) rather than inline with the pills
- Period title shown above filters when a non-"all" period is selected
- AI summary card (slimmed from former PeriodHighlight) at top of timeline — pulsing V mark while loading, 3 bullet points + activity counts when loaded
- Recent activity preview (last 3) on Portfolio tab
- **Search**: text input above the period filter chips; case-insensitive substring match on `asset_name` OR `personal_context`; combines with period filter via AND; client-side, no server round-trip; empty state adapts to "No entries match {query}"
- **"On this day" callout**: rendered above the timeline, independent of all filters; conditions — `occurred_at` shares today's month and day, is in a prior year, and is at least 30 days ago; oldest match wins when multiple qualify; displays a read-only entry-style row with a relative label ("1 year ago", "3 months ago"); tap clears active filters if the row is hidden, then smooth-scrolls to the matching entry in the timeline and plays a 1.5s amber ring highlight; uses browser-local date parsing to avoid UTC-offset drift
- Diary entries display each asset's current name via LEFT JOIN to `assets`. Deleted assets fall back to `mutations.asset_name`. The same join applies to the diary summary endpoint and the search predicate.
- Files: `src/app/diary/page.tsx`, `src/components/DiaryTab.tsx`, `src/app/api/chat/route.ts` (write), `src/app/api/diary-summary/route.ts` (AI summary)

### Investor Profile (Self-Building)
- Background Claude call after each conversation extracts lasting facts
- Stored in `users.profile` (jsonb)
- Fields: goal, risk_behaviour, investment_style, life_context, concerns, preferences, blind_spots, decision_patterns, interests
- Never overwrites — only adds or refines
- Visible at `/profile`. Avatar uses `users.avatar_url` (from Google OAuth) when present, falls back to two-letter initials in a `surface-elev` circle
- Sign-out button at the bottom of the Profile page.
- Profile page renders a one-line investor fingerprint in italic serif below the email when present. Generated by the profile extractor and stored at `users.profile.fingerprint`. Hidden when null (new users pre-first-extraction).
- Avatar is user-editable via tap-to-upload on the Profile page. Defaults to the Google profile photo on OAuth signup. Stored in Supabase Storage.
- Skipped for new-user onboarding conversations
- Files: `src/lib/profile-extractor.ts`, called from `src/app/api/chat/route.ts`, rendered inline in `src/app/profile/page.tsx`

### Design System
- Phase 1 of the redesign wired tokens into the codebase
- Colors and typography exposed as CSS variables in `src/app/globals.css`, surfaced as Tailwind utilities via `tailwind.config.ts`
- Mirror in TypeScript at `src/lib/tokens.ts` for inline JS contexts (Recharts colors, etc.)
- Fonts: Source Serif 4 (hero numbers, section titles), Albert Sans (body, labels, nav). Geist Mono is no longer used in UI chrome.
- Single accent: green (#4A7C5E). Positive uses the same green; negative uses muted coral (#B5564B). No accent for action signaling — action read from value pattern (sign of the delta, strikethrough for removes).
- The dimmed currency prefix on hero numbers (e.g. dimmer `€` next to bright digits) is intentional editorial styling per the mockups, not a CSS bug
- Mockups for canonical visual reference: `docs/redesign_mockups/portfolio.html`, `docs/redesign_mockups/diary.html`, `docs/redesign_mockups/chat.html`, `docs/redesign_mockups/profile.html`, `docs/redesign_mockups/tradeable-detail.html`, `docs/redesign_mockups/real-estate-detail.html`, `docs/redesign_mockups/static-detail.html`, `docs/redesign_mockups/bond-detail.html`

### Preferences (on Profile)
- Display currency (EUR/USD/GBP) and theme (Auto/Light/Dark) pickers live as a "Preferences" section on the Profile page under the context fields. No separate /settings route.

### Property visual
- Real estate uses an auto-generated map only. Photo upload has been removed. Map uses a light-theme MapLibre style with a dark variant pre-wired for the dark theme. PropertyMap caches the first render as PNG in Supabase Storage.

### Mortgage balance
- Displayed mortgage balance auto-amortizes from the stored anchor (initial balance + start date) via the `computeCurrentBalance` helper in `src/lib/mortgage.ts`. Monthly amortization is never logged in the diary. Notable events (extra payment, refinance, rate change, valuation update) are logged via chat.

### Cash, pension, and bonds naming and iconography
- Cash and pension entries are purpose-pots, not bank accounts. `AssetLogo` renders a generic wallet icon for both types. Bonds use a certificate icon and carry an issuer field. Onboarding and chat prompts ask "what's this for?" not "which bank?"

---

## What Is Incomplete or Fragile

### Dashboard Highlights — Pending
- Dashboard highlights cards (market events, milestones, reflections) — deferred pending user retention signal

### Profile Extraction — Untested at Scale
- Code is in place, runs as fire-and-forget background call
- Has not been verified to consistently produce useful extractions
- Cost: ~$0.003 per conversation
- Risk: may be too aggressive or too conservative; needs real-user tuning

---

## Known Bugs and Risks

- **Multiple lockfiles warning** in Next.js — cosmetic, both `package-lock.json` files exist
- **Middleware deprecation warning** in Next.js 16 — file convention is being renamed to `proxy`, currently functional
- **Token usage grows with portfolio size** — at 50+ assets the system prompt gets large; no compression layer
- **No retry on Yahoo Finance failures** — if Yahoo is down, prices show as offline (acceptable, not gracefully handled)
- **Historical mutations have currency-implicit-EUR values** — rows logged before the currency normalization fix have `before_value` and `after_value` stored as if they were EUR even when the position was USD-priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP
- **before_value / after_value semantic muddle** — values are stored EUR-equivalent but `currency` column is native. Pre-existing semantic inconsistency, not yet redesigned
- **Two-write atomicity** — asset update + mutation insert is not transactional. If the asset write succeeds and the mutation write fails, the diary skips an entry. Sentry captures the failure. Acceptable for MVP
- **Money input round-trip rounding** — a user typing $5,000 may see $4,999 after save when the FX rate doesn't divide evenly. We display the actual stored EUR-equivalent rather than caching the typed input. Acceptable for MVP.
- **Goal targets drift with FX** — goal `target_value` is stored in EUR at the rate active when the goal was set. As FX drifts, a user who set a $1,000,000 goal may see the displayed target shift slightly (e.g. $999,xxx or $1,001,xxx). The economic intent — the EUR amount stated at goal-setting time — is preserved.
- **Diary banker's notes render in the currency they were written in** — `personal_context` strings in `mutations` are rendered as stored. A user who switches display currency will see old entries in the previous currency's symbol. Intentional per the spec's no-retroactive-rewriting rule; diary entries are historical record.
