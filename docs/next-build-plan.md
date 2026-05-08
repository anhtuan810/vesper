# Next Build Plan

This is the prioritized roadmap for Vesper. MVP-focused. Avoid enterprise architecture. Each feature should be shippable in 1–3 days.

## What just shipped

- **Phase 3a — Daily snapshots cron**. Vercel cron writes one row per user per day to `snapshots`. Trigger also fires fire-and-forget on every successful mutation (chat API, asset PATCH, asset DELETE). Idempotent via unique index on `(user_id, date)`. Secured via `CRON_SECRET` header. Shared `writeSnapshot` helper in `src/lib/snapshot.ts`.
- **Phase 3b — Net worth chart + change pill**. `/api/snapshots` GET endpoint, `NetWorthChart` component on Portfolio tab between hero and allocation cards, range pills (1W / 1M / 3M / 1Y / ALL), 7-snapshot empty state, today marker. Hero now shows a change pill (% + EUR delta vs 1 month ago) when historical data exists. Allocation moved to its own card with header + DETAILS scroll-to-positions.
- **Diary cleanup pass**. Filter section compressed to two thin pill rows (period + action), counts removed, custom date range styled. Entry layout compressed to two lines (icon + name + delta + date, optional context note). Date format drops year for current-year entries. Real asset logos shipped via shared `AssetLogo` component (cryptocurrency-icons CDN, FMP for stocks, inline SVG for real estate, monogram fallback). Used in both `DiaryTab` and `PositionRow`.
- **Mutation unit tracking**. `mutations` table gained `before_units` / `after_units` columns. Chat API and asset PATCH/DELETE log unit changes. Diary and TradeableDetail recent activity show "+N shares / units / oz" deltas for tradeable mutations, fall back to value-based for real estate / cash / bonds / pension.
- **Phase 2b — Inline edit + delete for RealEstateDetail and StaticDetail**. Full CRUD parity with TradeableDetail. RealEstate inline-editable: name, address (re-geocodes server-side), property_type, size_sqm, country, value, all 6 mortgage fields. Static inline-editable: name, value, currency, plus all bond fields. ContextNotePrompt fires on >5% value change. EDIT button stopgap removed everywhere. `name` added to ALLOWED_COMMON. Address field decoupled from name display.
- **Cleanup A — Rename via chat**. Chat API edit action accepts `new_name` field. System prompt updated. Users can rename any asset by saying "Rename X to Y".
- **Cleanup B — Diary AI summary slimmed**. PeriodHighlight chart card removed (redundant with Portfolio chart). AI summary kept and demoted to lightweight card with pulsing V mark while loading. Period title moved above filter chips.

## Build Order

1. **Decision diary improvements** (search, "on this day" callout, inline note editing)
2. **Logo proxy** (privacy debt — proxy CDN logos through `/api/logo?symbol=...`)
3. **Dashboard highlights** (market events, milestones, reflections — was always planned, now unblocked)
4. **Scenario analysis UI**

This order: finish making the diary genuinely useful as a decision log, clear the one pressing tech debt, then start adding new top-level surfaces.

---

## 1. Decision Diary Improvements

### Goal
The diary's foundation is solid. Make it materially more useful as a decision log: searchable, surfaces past decisions on anniversaries, lets users add reasoning notes after the fact.

### Three sub-features

**Search**
- Text input above the period filter chips
- Filters mutations by `asset_name` OR `personal_context` substring (case-insensitive)
- Combines with existing period and action filters
- Client-side filter on already-loaded mutations array
- Empty-state copy adapts: "No entries match {query}"

**"On this day"**
- Callout above the entries list when conditions met
- Conditions: a mutation has `occurred_at` matching today's month + day in any prior year, AND is at least 30 days old
- Picks oldest matching mutation if multiple
- Display: serif italic header "On this day" + entry-style row + relative label ("1 year ago", "3 months ago")
- Tap scrolls to that mutation in the timeline
- Independent of search and action filters — anniversary surprise

**Inline expandable notes**
- Each diary entry becomes tappable
- Tap expands an editor below the entry showing full `personal_context`
- "+ Add note" affordance when context is empty
- Save calls existing `PATCH /api/mutations/[id]`
- Optimistically updates local state, falls back on error

### Database Impact
- None — `personal_context` already exists on `mutations`

### Files Likely to Change
- `src/components/DiaryTab.tsx` — search input, "on this day" block, inline expanded view
- New: small inline note editor component (or inline in DiaryTab if it stays simple)

---

## 2. Logo Proxy

### Goal
AssetLogo currently fetches from external CDNs (jsdelivr for crypto, FMP for stocks), which leaks user holdings to those CDNs. Build a proxy at `/api/logo?type=...&symbol=...` that fetches once, caches in-process, serves to the client.

### Expected behavior
- Client-side AssetLogo component points at `/api/logo?...` instead of the CDN URLs directly
- Server-side route fetches from the appropriate upstream, caches the bytes in-process, and serves with appropriate cache headers
- Long cache lifetime acceptable — logos rarely change
- Falls back to monogram on upstream failure

### Database Impact
- None — pure server-side caching

### Files Likely to Change
- `src/components/AssetLogo.tsx` — swap CDN URLs for proxy URLs
- New: `src/app/api/logo/route.ts`
- Optional: add a stale-while-revalidate header strategy

---

## 3. Dashboard Highlights

### Goal
The original tech spec's launch feature #9 — daily highlights surfaced on the Portfolio tab. Three types: market events affecting holdings (Claude-filtered), portfolio milestones (deterministic from snapshots + dynamic step sizing), personal reflections (anniversary-style from mutation history).

### Expected UI
- Horizontal card carousel between net worth hero and allocation card on Portfolio tab
- Max 3 cards, section hidden entirely when no highlights
- Each card: type icon, title (one line), detail (one sentence), impact amount if applicable
- Highlights expire: market events 24h, milestones 7d, reflections 3d

### Database Impact
- The `highlights` table already exists in schema. No data being written yet
- Reads from: `assets`, `snapshots`, `mutations`

### Files Likely to Change
- `src/app/api/cron/highlights/route.ts` (new) — three sub-jobs for the three highlight types
- `src/lib/milestones.ts` (new) — dynamic step detection
- `src/lib/reflections.ts` (new) — anniversary checks
- `src/components/HighlightsCarousel.tsx` (new)
- `src/app/page.tsx` or `src/components/PortfolioTab.tsx` — mount the carousel
- `vercel.json` — add the highlights cron job

---

## 4. Scenario Analysis UI

### Goal
Let users explore "what if" questions visually, not just conversationally. Examples: "what if I sell my apartment", "what if NVIDIA doubles", "what if I add €50k to ETFs".

### Expected UI
- A "Scenarios" entry point on the Portfolio tab
- User can clone the current portfolio and modify it: change values, remove positions, add hypothetical ones
- Side-by-side comparison: Current vs Scenario (net worth, allocation, concentration)
- "Save scenario" to persist
- "Discuss with assistant" to send the scenario into chat for a written analysis

### Database Impact
- New `scenarios` table: `id`, `user_id`, `name`, `assets_snapshot` (jsonb), `created_at`
- No changes to existing tables

### Files Likely to Change
- `src/app/scenarios/page.tsx` (new) — scenarios list view
- `src/components/ScenarioBuilder.tsx` (new)
- `src/app/api/scenarios/route.ts` (new) — CRUD endpoints
- `src/lib/claude.ts` — extend the system prompt to handle scenario context
- New SQL migration for `scenarios` table

### Notes
- The chat assistant already handles scenarios conversationally — this UI complements, not replaces it
- Don't over-design. Two columns (current + scenario), a few editable fields, one comparison panel

---

## Out of Scope for Now

- Group-by-year header in diary — premature
- Expanded mutation view showing the full conversation that produced it — requires linking mutations to message ranges, data plumbing not in place
- Weekly insight email — wait until users actually retain
- Allocation benchmarking — nice-to-have, not core
- Shareable portfolio report — growth feature, not retention
- Mobile native app — web-first
- Tax features — never, not Vesper's lane
- Broker sync / bank integrations — never for MVP, manual + AI-driven is the differentiator

---

## Tech Debts

- The `before_value` / `after_value` columns on `mutations` are EUR-equivalents but `currency` is native — pre-existing semantic muddle, separate task to design properly
- No type validation on `personal_context` body — fine for MVP, revisit if API ever goes public
- Two-write atomicity (asset update + mutation insert) is not transactional — if this becomes a real reliability issue, move both writes into a Postgres function via Supabase RPC
- Hardcoded FX fallback rates drift over time — review annually if the cache and frankfurter.app both fail
- No tests — accepted for MVP, will become a problem as feature surface grows
- No analytics (PostHog/Mixpanel) — defer until user count justifies it
