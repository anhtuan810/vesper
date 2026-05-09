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
- **Diary improvements**. Inline expandable notes (tap entry → edit `personal_context` → PATCH save with optimistic update). Search input above filter chips (case-insensitive substring on `asset_name` OR `personal_context`, AND-combined with period and action filters). "On this day" callout (same MM-DD in a prior year, ≥30-day floor, oldest match, scroll-and-amber-highlight on tap, filter-independent). All in `src/components/DiaryTab.tsx`.
- **Portfolio change validation**. `src/lib/validations.ts` invoked from `/api/chat` before any DB write. All-or-nothing: any negative-unit or negative-value result rejects the full turn. Banker's-tone error messages saved as the assistant reply. Float tolerance `1e-9` for fractional crypto. `edit` mutations now propagate user-stated `buy_date` to `mutations.occurred_at` (was always writing today).
- **BottomNav on /chat + layout hardening**. Restored mobile bottom navigation on the chat route. `height: 100dvh` + `padding-bottom: calc(64px + env(safe-area-inset-bottom))` contains the flex column to the viewport. `scrollbar-gutter: stable` on body prevents position:fixed elements from shifting when page-level scrollbars appear. `overflow-wrap: break-word` on message bubbles prevents horizontal page overflow from long URLs.
- **DB-backed chat history fallback**. New `GET /api/messages?limit=20` endpoint (authenticated, DESC fetch reversed to ASC for display, capped at 50). `useChatSession` now falls back to a single DB fetch when localStorage is absent, expired, or empty — resolves the "returning user after 24h sees empty chat while Claude references their conversation" trust gap. Works cross-device. Fetched history is written back to localStorage to warm the cache.

## Build Order

1. **Display currency parameterization** (EUR-equivalent storage, per-user display preference, single formatting utility, system prompt parameterized)
2. **Logo proxy** (privacy debt — proxy CDN logos through `/api/logo?symbol=...`)
3. **Dashboard highlights** (market events, milestones, reflections — unblocked now diary improvements shipped)
4. **Scenario analysis UI**

This order: fix the currency display gap that limits the app to EUR-centric users, clear the CDN privacy debt, then add new top-level surfaces.

---

## 1. Display Currency Parameterization

**Source of truth: `currency-feature-spec.md`.** Read it before starting any phase.

### Summary

Vesper currently renders every number in EUR. The plan parameterizes display currency per-user (EUR / USD / GBP at launch) while keeping EUR as the canonical storage and math unit. Real estate gains a native currency by location for transparency. A `/settings` route houses the picker.

### Decisions (all settled)

- **Storage**: EUR-equivalent on every numeric column. Non-negotiable.
- **FX pivot**: EUR (frankfurter.app is ECB-anchored).
- **Display options at launch**: EUR, USD, GBP. More currencies later.
- **Real estate**: native currency per asset, captured at add time from country (NL → EUR, US → USD, UK → GBP).
- **Settings**: new `/settings` route, currency picker only for now, scaffolded for future settings.
- **Default for existing users**: EUR (no surprise switching).
- **Milestones**: scale to display currency. EUR/USD/GBP share the same step pattern (`1k / 5k / 10k / 50k / 100k / 500k / 1M / 5M`).

### Phases (one chat per phase)

- **Phase A — Foundation**. Schema column, `formatMoney` utility, `useDisplayCurrency` hook, `/settings` route. No visible change.
- **Phase B — Display swap**. Every callsite swapped from `fmt()` / hardcoded `€` to `formatMoney`. App fully renders in user's display currency.
- **Phase C — Inputs + Claude prompt**. Manual inputs convert at write to EUR. System prompt parameterized with `displayCurrency`.
- **Phase D — Real-estate native currency**. Per-property native currency captured at add time.

Phases A–C run in order; Phase D can run after C or in parallel with C cleanup.

### Process

Read `currency-feature-spec.md`, run the named phase, ship, review, merge. Do not chain phases in one session.

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
- Compound index on `messages (user_id, created_at DESC)` would optimize the chat history fallback fetch (`GET /api/messages`). Not blocking at current scale (hundreds of messages per user). File for a future migration when query latency becomes measurable
- Chat history mapper silently coerces unknown `role` values to `"assistant"` (`from: m.role`). Acceptable given the schema only ever writes `"user"` or `"assistant"`, but a `continue` in the mapper would be more defensive against future schema drift
