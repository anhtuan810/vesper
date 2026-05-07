# Next Build Plan

This is the prioritized roadmap for Vesper post-handoff. MVP-focused. Avoid enterprise architecture. Each feature should be shippable in 1–3 days.

## Build Order

1. **Manual asset CRUD** (foundational fix)
2. **Currency normalization** (correctness fix)
3. **Mortgage tracking improvements** (depth fix)
4. **Snapshots / history** (enables future features)
5. **Decision diary improvements** (polish)
6. **Scenario analysis UI** (depth feature)

This order is deliberate: fix correctness and gaps first, then add depth.

---

## 1. Manual Asset CRUD

### Goal
Let users edit and delete assets directly from the dashboard, without going through the chat assistant. The chat works but is brittle for precise edits (correcting a typo, fixing a wrong value).

### Expected UI
- Click any row in the positions table → opens a side panel or modal with editable fields
- Fields shown match the asset type (real estate gets mortgage fields, stocks get symbol/units, etc.)
- Save and Delete buttons in the panel
- Optional: small inline "edit" icon on hover

### Database Impact
- No schema changes
- Every save/delete must write a row to `mutations` (same pattern as the AI flow)
- Use a server action or new API route to enforce the mutation log

### Files Likely to Change
- `src/app/page.tsx` — make rows clickable, add modal/panel state
- `src/components/AssetEditor.tsx` (new) — the editor UI
- `src/app/api/assets/route.ts` (new) — PATCH and DELETE endpoints with mutation logging
- `src/lib/hooks.ts` — add a `refetchAssets` trigger after mutations

---

## 2. Currency Normalization

### Goal
Fix the silent bug where USD-denominated stocks (and other non-EUR assets) display wrong values. Right now everything is treated as EUR even when the underlying price is USD.

### Expected UI
- All values continue to display in EUR (user-facing)
- Asset detail panel optionally shows native currency price for transparency (e.g. "AAPL — $185.20 → €172.40")
- A subtle tooltip or info icon explaining the conversion

### Database Impact
- No schema changes (the `currency` field already exists on assets)
- Need a `fx_rates` cache table OR an external FX API call on each price refresh
- Suggested: small `fx_rates` table with `base`, `quote`, `rate`, `fetched_at`. Refreshed daily.

### Files Likely to Change
- `src/app/api/prices/route.ts` — convert native currency to EUR before returning
- `src/lib/hooks.ts` — handle conversion edge cases
- `src/app/api/fx/route.ts` (new) — FX rate fetching
- New SQL migration to create `fx_rates` table

### Notes
- Free FX sources: exchangerate.host, frankfurter.app, ECB rates
- Conversion should happen server-side, not in the browser
- Yahoo Finance returns the native currency in its response — use that

---

## 3. Mortgage Tracking Improvements

### Goal
Make the existing mortgage data more useful. Currently we store all the fields but only display equity. The assistant can answer payoff questions but no UI surfaces them.

### Expected UI
- On a real estate asset's detail panel: a small "Mortgage" section showing
  - Current balance, interest rate, monthly payment
  - Estimated payoff date based on mortgage type
  - Total interest paid to date and remaining
- On the dashboard: total monthly mortgage outflow shown as a stat card (alongside Positions, Countries, etc.)

### Database Impact
- No schema changes — all required fields already exist

### Files Likely to Change
- `src/lib/mortgage.ts` (new) — payoff calculations for annuity / linear / interest_only
- `src/components/AssetEditor.tsx` — display mortgage details
- `src/app/page.tsx` — add monthly mortgage stat card

### Notes
- Math is straightforward and well-documented
- Country-agnostic — just amortization formulas, no tax assumptions

---

## 4. Snapshots / History

### Goal
Capture daily net worth snapshots so we can build a net-worth-over-time chart. This unlocks all future trend features.

### Expected UI
- Initially: a simple line chart on the Portfolio tab showing net worth over the last 30 / 90 / 365 days
- Toggle between gross and net
- No advanced controls in MVP — just one chart

### Database Impact
- Use the existing `snapshots` table (already in schema)
- Insert one row per user per day with `total_value` and `breakdown`

### Files Likely to Change
- `src/app/api/cron/snapshot/route.ts` (new) — daily snapshot job
- `vercel.json` — add cron config (Vercel Cron is free for one job)
- `src/components/NetWorthChart.tsx` (new) — line chart (use Recharts or similar)
- `src/app/page.tsx` — add chart between hero and stats

### Notes
- Vercel Cron Jobs are limited but sufficient for one daily run
- Snapshot trigger should also fire after large mutations (e.g. > 5% net worth change) to avoid stale charts
- Backfill: not needed for MVP, charts start from launch day

---

## 5. Decision Diary Improvements

### Goal
Make the diary more valuable, not just a log. Currently it's chronological with limited filtering. The diary is the feature most differentiated from competitors — invest in making it good.

### Expected UI
- **Search** by asset name or context keyword
- **Group by year** when timeline gets long
- **"On this day" callout** at the top of the diary if any past mutation matches today's date
- Click a mutation → expanded view showing the full conversation that produced it (read-only)
- Optional: ability to add a manual note to an existing mutation entry

### Database Impact
- Add `notes` (text, nullable) column to `mutations`
- No new tables

### Files Likely to Change
- `src/app/page.tsx` — diary tab improvements
- `src/components/MutationDetail.tsx` (new) — expanded view modal
- `src/app/api/mutations/[id]/route.ts` (new) — PATCH for notes
- New SQL migration to add `notes` column

### Notes
- Keep search client-side for now — diaries won't be huge for years
- The "on this day" pattern primes future highlights feature

---

## 6. Scenario Analysis UI

### Goal
Let users explore "what if" questions visually, not just conversationally. Examples: "what if I sell my apartment", "what if NVIDIA doubles", "what if I add €50k to ETFs".

### Expected UI
- A "Scenarios" button on the Portfolio tab → opens a modal
- User can clone the current portfolio and modify it: change values, remove positions, add hypothetical ones
- Side-by-side comparison: Current vs Scenario (net worth, allocation, concentration)
- "Save scenario" to persist for later
- "Discuss with assistant" to send the scenario into chat for a written analysis

### Database Impact
- New `scenarios` table: `id`, `user_id`, `name`, `assets_snapshot` (jsonb), `created_at`
- No changes to existing tables

### Files Likely to Change
- `src/app/scenarios/page.tsx` (new) — scenarios list view
- `src/components/ScenarioBuilder.tsx` (new) — the modal/builder
- `src/app/api/scenarios/route.ts` (new) — CRUD endpoints
- `src/lib/claude.ts` — extend the system prompt to handle scenario context
- New SQL migration for `scenarios` table

### Notes
- The chat assistant already handles scenarios conversationally — this UI complements, not replaces it
- Don't over-design. Two columns (current + scenario), a few editable fields, one comparison panel.

---

## Out of Scope for Now

- Dashboard highlights cards (market events, milestones, reflections) — wait until snapshots exist
- Weekly insight email — wait until users actually retain
- Allocation benchmarking — nice-to-have, not core
- Shareable portfolio report — growth feature, not retention
- Mobile app — web-first
- Tax features — never, not Vesper's lane
- Broker sync / bank integrations — never for MVP, manual + AI-driven is the differentiator
