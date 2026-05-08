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
- Files: `src/app/page.tsx`, `src/app/diary/page.tsx`, `src/app/chat/page.tsx`, `src/app/profile/page.tsx`, `src/app/asset/[id]/page.tsx`, `src/components/BottomNav.tsx`

### Portfolio Dashboard
- Header strip with `Vesper` wordmark + status dot (green/amber/faint based on price-fetch health) + refresh button
- Net worth hero in serif (Fraunces) with intentionally dimmed currency prefix per design spec
- Segmented allocation bar (replaced the donut chart in Phase 2)
- Allocation breakdown by asset type with percentage and absolute value, colored dots match the bar
- Gross / debt subtitle when mortgages exist
- Concentration warning card (amber outline) when triggered
- Milestone progress bar with dynamic step sizing
- Stat cards (Positions, Countries)
- Files: `src/app/page.tsx`, `src/components/NetWorthHero.tsx`, `src/components/AllocationBar.tsx`, `src/components/PositionRow.tsx`, `src/components/MiniSparkline.tsx`

### Asset Detail Pages
- Three layout variants dispatched by asset type from `src/app/asset/[id]/page.tsx`
- **Tradeable** (stocks, ETFs, crypto, gold): icon, big EUR price, change pill, time-range tabs (1D/1W/1M/3M/1Y/ALL), full price chart, metric grid (units, avg buy, live price, total return), recent activity scoped to the asset, EDIT / DISCUSS CTAs
- **Real Estate**: property hub with map (or photo if uploaded), Street View link, value composition bar, mortgage block with payoff projection, scoped activity
- **Static** (cash, pension, bonds, other): minimal layout — balance hero, optional currency code, scoped activity. Bonds get an additional `BondBlock` showing issuer, coupon rate, maturity date, ISIN
- Crypto positions show a 24h volatility block; stocks do not
- Crypto positions hide the country field
- Files: `src/components/asset-detail/{TradeableDetail,RealEstateDetail,StaticDetail,CryptoVolatilityBlock,BondBlock}.tsx`, `src/components/PriceChart.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`

### Real Estate & Mortgage Tracking
- Properties stored as assets with `type = 'real_estate'`
- Mortgage fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type` (annuity/linear/interest_only), `mortgage_start_date`, `mortgage_end_date`
- Property fields (Phase 5): `address`, `latitude`, `longitude`, `photo_url`, `property_type`, `size_sqm`
- Equity calculated as `value − mortgage_balance`. Net worth uses equity, not gross
- `MortgageBlock` shows balance, rate, monthly payment, type, payoff projection chart with TODAY marker, sub-stats (paid to date, interest paid, time remaining, mortgage-free date)
- Linear mortgages render a straight line; interest-only mortgages show "—" for mortgage-free date
- `PropertyMap` renders OpenFreeMap with MapLibre GL JS, custom dark style matching design tokens, amber pin at lat/lng. After first render, captures `map.getCanvas().toDataURL()` and uploads to `property-photos/<user_id>/<asset_id>.png` so subsequent loads serve a cached image
- Empty state: when `latitude` / `longitude` are null, renders a styled placeholder with "Add address" affordance instead of a broken image
- Address geocoding via OSM Nominatim, structured query format (`street=`, `city=`, `country=`) for precision. Re-runs whenever `address` changes
- Dutch postcode-then-city addresses parsed via `extractCityFromPostcodeSegment` helper (handles `"5629GS Eindhoven"` → `"Eindhoven"`)
- Street View link uses the official Maps URL API: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=lat,lng`. Hidden when no coords
- Country-agnostic — pure math, no tax assumptions
- Files: `src/components/asset-detail/RealEstateDetail.tsx`, `src/components/PropertyMap.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/lib/mortgage.ts`, `src/lib/maps.ts`, `src/app/api/geocode/route.ts`

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

### Concentration Warnings
- Single position > 40% of gross
- Single asset type > 60% of gross
- Cash > 30%
- Only one asset class with multiple positions
- Displayed as amber-outlined card above stats
- Files: `src/app/page.tsx` (`getWarnings`)

### Milestone Progress Bar
- Dynamic step sizing scales with portfolio size (€1k below €10k, €5k below €50k, €10k below €100k, €50k below €500k, €100k below €1M, €500k below €5M, €1M above)
- Single thin progress bar — no charts, no goal editor
- Currency-aware via `getMilestoneProgress(total, currency)`
- Files: `src/lib/projection.ts`

### Conversational Assistant
- Mobile: full-page route at `/chat` with a 4-suggestion empty state
- Desktop: floating popup (`ChatPopup`)
- Image paste support (Claude vision reads broker app screenshots)
- Changes-only architecture — Claude returns `<changes>` block with only what changed (add/edit/remove), not the full portfolio
- Three actions parsed by backend: add (INSERT), edit (UPDATE by name match, case-insensitive), remove (DELETE by name match, case-insensitive)
- Currency on insert: derived from Yahoo's reported currency when symbol is known, else EUR default
- Strict topic boundary in system prompt — declines off-topic requests with a fixed redirect
- Rate limit: 50 messages per user per day
- Input cap: 500 characters
- Auto-retry on Claude API failure (3 attempts with backoff)
- EDIT button on detail pages routes to `/chat` with a seeded edit message (stopgap until full inline CRUD ships)
- Files: `src/components/ChatPopup.tsx`, `src/app/chat/page.tsx`, `src/app/api/chat/route.ts`, `src/lib/claude.ts`

### Conversational Onboarding
- Triggers when user has zero assets
- Three-step flow: assets first, anything else, optional soft goal
- "Just keeping track" accepted as valid goal answer
- Mentions screenshot capability during step 1
- Files: `src/lib/claude.ts` (`buildOnboardingPrompt`), routed in `src/app/api/chat/route.ts`

### Financial Diary
- Every add/edit/remove via chat creates a row in `mutations`
- Captured fields: action, before_value, after_value, currency, personal_context, portfolio_total, occurred_at, recorded_at
- Displayed at `/diary`
- Period summary card: hero value, "+€X since DATE" secondary line, line chart with date axis labels, action counts ("6 added · 6 updated · 3 data points")
- AI-generated summary card with 3 bullet points in banker's tone (via `/api/diary-summary`)
- Time-range chips: All time / This week / This month / Last 3M / This year / Custom
- Filter chips: All / Added / Updated / Removed
- Entries grouped by month with 3-letter monogram badges (asset symbol if present, else first 3 chars of name)
- Italic context line per entry, banker's-note style enforced via system prompt (no implementation copy like "auto-filled" or "live data")
- Recent activity preview (last 3) on Portfolio tab
- Files: `src/app/diary/page.tsx`, `src/components/DiaryTab.tsx`, `src/app/api/chat/route.ts` (write), `src/app/api/diary-summary/route.ts` (AI summary)

### Investor Profile (Self-Building)
- Background Claude call after each conversation extracts lasting facts
- Stored in `users.profile` (jsonb)
- Fields: goal, risk_behaviour, investment_style, life_context, concerns, preferences, blind_spots, decision_patterns, interests
- Never overwrites — only adds or refines
- Visible at `/profile`. Avatar uses `users.avatar_url` (from Google OAuth) when present, falls back to two-letter initials in a `surface-elev` circle
- Sign-out button at the bottom of the Profile page (moved from header in mobile review pass)
- Skipped for new-user onboarding conversations
- Files: `src/lib/profile-extractor.ts`, called from `src/app/api/chat/route.ts`, rendered inline in `src/app/profile/page.tsx`

### Design System
- Phase 1 of the redesign wired tokens into the codebase
- Colors and typography exposed as CSS variables in `src/app/globals.css`, surfaced as Tailwind utilities via `tailwind.config.ts`
- Mirror in TypeScript at `src/lib/tokens.ts` for inline JS contexts (Recharts colors, etc.)
- Fonts: Fraunces (serif, hero numbers and section titles), Plus Jakarta Sans (body), Geist Mono (financial figures, dates, metadata)
- Single accent: amber (#D4A574). Green (#6BAA75) and coral (#C97A6E) for semantic states only
- The dimmed currency prefix on hero numbers (e.g. dimmer `€` next to bright digits) is intentional editorial styling per the mockups, not a CSS bug
- Mockups for canonical visual reference: `docs/redesign-mockups/main-screens.html`, `docs/redesign-mockups/real-estate-detail.html`

---

## What Is Incomplete or Fragile

### Manual Asset CRUD — Stopgap, Full Version Pending
- No dedicated UI for editing or deleting assets
- The detail-page EDIT button currently routes to `/chat` with a seeded "I'd like to update [asset name]" message. The user reviews and sends, then the existing chat-driven edit flow handles the rest
- DISCUSS button routes to chat with the asset as conversational context
- Full inline edit form (side panel or modal) with mutation logging is item #1 in `next-build-plan.md`

### Snapshots — Schema Only
- `snapshots` table exists but has no daily cron writing to it
- Net worth over time chart cannot be built until snapshots are populated
- The diary period-summary card hides its percentage indicator until snapshot history is sufficient (avoids misleading +3591% style numbers from backfill artifacts)

### Scenario Analysis — Backend Only
- The assistant can answer "what if" questions in chat (sell, buy, market drop)
- No dedicated UI for scenario exploration
- No persistent scenarios

### Profile Extraction — Untested at Scale
- Code is in place, runs as fire-and-forget background call
- Has not been verified to consistently produce useful extractions
- Cost: ~$0.003 per conversation
- Risk: may be too aggressive or too conservative; needs real-user tuning

### Recent Activity Preview — Limited
- Shows last 3 mutations on Portfolio tab
- No grouping, no smart filtering — just chronological top 3

---

## Known Bugs and Risks

- **Multiple lockfiles warning** in Next.js — cosmetic, both `package-lock.json` files exist
- **Middleware deprecation warning** in Next.js 16 — file convention is being renamed to `proxy`, currently functional
- **Token usage grows with portfolio size** — at 50+ assets the system prompt gets large; no compression layer
- **No retry on Yahoo Finance failures** — if Yahoo is down, prices show as offline (acceptable, not gracefully handled)
- **No deduplication on add** — adding "AAPL" twice creates two rows; the assistant usually catches this conversationally but the backend does not enforce it
- **Historical mutations have currency-implicit-EUR values** — rows logged before the currency normalization fix have `before_value` and `after_value` stored as if they were EUR even when the position was USD-priced. Cannot be backfilled retroactively without historical FX rates per `occurred_at`. Acceptable for MVP
- **Frankfurter fallback path** — if `fx_rates` is empty AND the API is unreachable on first run, prices may surface in native currency rather than EUR. Defensive guards are in place but not heavily tested
