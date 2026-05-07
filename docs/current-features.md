# Current Features

## Implemented and Working

### Authentication
- **Google OAuth** via Supabase Auth
- **Email magic link** as fallback
- **Session management** via cookies
- **Middleware route protection** redirects unauthenticated users to /login
- **Auto-creates user record** on first signup via Supabase trigger
- Files: `src/middleware.ts`, `src/app/login/page.tsx`, `src/app/auth/callback/route.ts`

### Dashboard with Three Tabs
- **Portfolio tab** — donut chart, allocation bars, stats, milestone bar, recent activity, positions table
- **Diary tab** — chronological list of all mutations, grouped by month, filterable
- **Profile tab** — investor profile fields ("What Vesper knows about you")
- Tabs persist state during session; reset on page reload (acceptable for MVP)
- Files: `src/app/page.tsx`

### Net Worth Calculation
- Total = sum of all asset values, with real estate using equity (value − mortgage_balance)
- Donut chart shows net worth in center, allocation by type around the ring
- Allocation bars show each asset class with percentage and absolute value
- Gross / debt breakdown shown when mortgages exist
- Files: `src/app/page.tsx` (computed inline)

### Concentration Warnings
- Triggers when single position > 40% of gross
- Triggers when single asset type > 60% of gross
- Triggers when cash > 30%
- Triggers when only one asset class exists with multiple positions
- Displayed as amber banner above stats
- Files: `src/app/page.tsx` (`getWarnings` function)

### Milestone Progress Bar
- Dynamic step sizing scales with portfolio size (€1k below €10k, €5k below €50k, ..., €100k below €1M)
- Shows distance to next round number
- Single thin progress bar — no charts, no goal editor
- Files: `src/lib/projection.ts`, used in `src/app/page.tsx`

### Real-time Prices
- Yahoo Finance via server-side API route (no CORS issues)
- Batch fetch endpoint takes array of symbols, returns prices + previousClose
- Live/offline indicator in nav showing X/Y live
- Manual refresh button
- Day change badges per position (green/red)
- Files: `src/app/api/prices/route.ts`, `src/lib/hooks.ts` (`useAssets`)

### Conversational Assistant
- Floating chat popup, resizable (drag top-left corner)
- Image paste support (Claude vision reads broker app screenshots)
- Changes-only architecture — Claude returns `<changes>` block with only what changed (add/edit/remove), not the full portfolio
- Three actions parsed by backend: add (INSERT), edit (UPDATE by name match), remove (DELETE by name match)
- Strict topic boundary in system prompt — declines off-topic requests
- Rate limit: 50 messages per user per day
- Input cap: 500 characters
- Auto-retry on Claude API failure (3 attempts with backoff)
- Files: `src/components/ChatPopup.tsx`, `src/app/api/chat/route.ts`, `src/lib/claude.ts`

### Conversational Onboarding
- Triggers when user has zero assets
- Three-step flow: assets first, anything else, optional soft goal
- "Just keeping track" is accepted as a valid answer for the goal step
- Mentions screenshot capability during step 1
- Files: `src/lib/claude.ts` (`buildOnboardingPrompt`), routed automatically in `src/app/api/chat/route.ts`

### Real Estate & Mortgage Tracking
- Properties stored as assets with `type = 'real_estate'`
- Optional mortgage fields: `mortgage_balance`, `mortgage_rate`, `monthly_payment`, `mortgage_type` (annuity/linear/interest_only), start/end dates
- Equity calculated as value − mortgage_balance
- Net worth uses equity, not gross
- Country-agnostic — pure math, no tax assumptions
- Files: `src/lib/supabase.ts` (Asset type), `src/app/page.tsx` (display)

### Financial Diary (Mutation Logging)
- Every add/edit/remove via chat creates a row in `mutations` table
- Captured fields: action, before_value, after_value, personal_context (from conversation), portfolio_total, occurred_at, recorded_at
- Browseable in Diary tab grouped by month
- Filterable: All / Added / Updated / Removed
- Recent activity preview (last 3) on Portfolio tab
- Files: `src/app/api/chat/route.ts` (write), `src/app/page.tsx` (read + display)

### Investor Profile (Self-Building)
- Background Claude call after each conversation extracts lasting facts
- Stored in `users.profile` (jsonb)
- Fields: goal, risk_behaviour, investment_style, life_context, concerns, preferences, blind_spots, decision_patterns, interests
- Never overwrites — only adds or refines
- Visible in Profile tab
- Skipped for new-user onboarding conversations
- Files: `src/lib/profile-extractor.ts`, called from `src/app/api/chat/route.ts`

---

## What Is Incomplete or Fragile

### Currency Handling — UNCERTAIN
- All values stored as numbers in EUR (assumed)
- Yahoo Finance returns prices in native currency (USD for AAPL, GBp for some London stocks)
- Frontend assumes EUR for all display
- No FX conversion layer — USD stocks may be displayed at USD price as if it were EUR
- **Risk: incorrect totals for non-EUR positions**
- Status: works for EUR-denominated portfolios, breaks silently for mixed-currency portfolios

### Manual Asset CRUD — Missing
- No UI buttons to edit or delete assets
- All changes must go through the chat assistant
- Acceptable for MVP but limiting if the assistant misinterprets intent

### Snapshots — Schema Only
- `snapshots` table exists in schema
- No daily cron job to populate it
- Net worth over time chart cannot be built until snapshots are populated
- Currently no historical data for trend analysis or projection accuracy

### Mortgage Payoff Projection — Not Surfaced
- Math utility could be built easily
- Currently only the equity calculation is shown
- The assistant can answer payoff questions if asked, but no UI shows projected payoff date

### Scenario Analysis — Backend Only
- The assistant can answer "what if" questions in chat (e.g., "what if I sell my apartment")
- No dedicated UI for scenario exploration
- No persistent scenarios — each what-if is conversational only

### Profile Extraction — Untested at Scale
- Code is in place, runs as fire-and-forget background call
- Has not been verified to consistently produce useful extractions
- Cost: ~$0.003 per conversation
- Risk: may be too aggressive or too conservative; needs real-user tuning

### Recent Activity Preview — Limited
- Shows last 3 mutations on Portfolio tab
- No grouping, no smart filtering — just chronological top 3
- Could be smarter (e.g., show most significant changes, not just most recent)

---

## Known Bugs and Risks

- **Multiple lockfiles warning** in Next.js — cosmetic, both `package-lock.json` files exist
- **Middleware deprecation warning** in Next.js 16 — file convention is being renamed to `proxy`, currently functional
- **Dev mode DNS leak warning** during build — cosmetic
- **Token usage grows with portfolio size** — at 50+ assets the system prompt gets large; no compression layer yet
- **No retry on Yahoo Finance failures** — if Yahoo is down, prices show as offline (acceptable, but not gracefully handled)
- **No deduplication on add** — adding "AAPL" twice creates two rows; the assistant usually catches this conversationally but the backend does not enforce it
- **Chat UI duplicated across `ChatPopup` and `/chat` route** — `ChatPopup` uses `position: fixed` which can't be overridden cleanly, so the mobile full-page chat at `/chat` replicates the same UI logic inline. Both share a `sessionStorage` key for conversation history. Future cleanup: refactor `ChatPopup` to accept a `variant` prop (`"floating" | "fullpage"`) and render both surfaces from one component.
- **Sparkline fetches are per-row, not batched. Each PositionRow independently calls usePriceHistory for its own symbol. With 14+ positions, that's 14+ requests to /api/prices/history per dashboard load. The 5-minute server cache mitigates this in steady state, but Vercel cold starts will burst-fetch from Yahoo across users. Future cleanup: batch-fetch at PortfolioTab level and pass closes down as a prop, mirroring how useAssets already handles live prices.
- **Rate field overloaded. Cash and pension assets reuse mortgage_rate to store interest rate, since no dedicated interest_rate column exists. Display works correctly — the row hides when null. Future cleanup: add a dedicated interest_rate numeric column, migrate existing mortgage_rate values for non-mortgage assets if any exist, and update StaticDetail.tsx to read from the right field per asset type.
- **Phase 5/6 carryover bugs (open). As of the redesign sprint completion: (1) Property hub map renders briefly then shows broken-image icon — likely Storage URL is using public format for a private bucket; needs signed URL generation. (2) Street view button opens Google Maps but doesn't navigate to the property's actual coordinates. (3) Currency overlap on price hero displays — Phase 6 audit incorrectly concluded this was fixed; visual inspection shows € still overlaps the first digit. (4) Chat assistant doesn't populate address/latitude/longitude when user mentions a property address conversationally.