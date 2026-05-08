# Next Build Plan

This is the prioritized roadmap for Vesper post-redesign and post-currency-normalization. MVP-focused. Avoid enterprise architecture. Each feature should be shippable in 1–3 days.

## What just shipped (context for the next pass)

- Full mobile-first redesign across six phases (design tokens, visual refresh, route split, asset detail variants for tradeable / real estate / static, bond block)
- Mobile UI review pass (header strip, profile avatar, bottom nav cleanup, chat brand mark removal, diary summary card redesign, monogram unification, banker's-note context style, cash subtitle, property city subtitle parser)
- Real estate Phase 5 follow-ups (PropertyMap empty state, Street View URL fix, address re-geocoding, Dutch postcode-then-city parser)
- Currency normalization end-to-end: `fx_rates` table, `/api/fx` lazy refresh, server-side EUR conversion in `/api/prices`, currency-aware display layer, `mutations.currency` column, self-healing currency tags on assets
- EDIT button stopgap: routes to chat with a seeded edit message until full inline CRUD is built

## Build Order

1. **Manual asset CRUD** (full inline version)
2. **Daily snapshots cron** (unblocks net-worth-over-time chart)
3. **Net worth over time chart** (depends on #2)
4. **Decision diary improvements** (search, "on this day", expanded mutation view)
5. **Scenario analysis UI**

This order: close the visible UX gap first (CRUD), then build the data pipeline that unlocks future trend features (snapshots → chart), then iterate on the diary that's already differentiated, then add scenario depth.

---

## 1. Manual Asset CRUD

### Goal
Let users edit and delete assets directly from the asset detail page, without going through the chat assistant. The chat works but is brittle for precise edits (correcting a typo, fixing a wrong value, deleting a stale row).

### Current state
The EDIT button on asset detail pages exists but is a stopgap — it routes to `/chat` with a pre-filled "I'd like to update [asset name]" message. That works but adds round trips and feels slower than direct editing.

### Expected UI
- Replace the current stopgap navigation with a side panel or modal opened from the EDIT button on each asset detail variant
- Fields shown match the asset type:
  - Tradeable: name, symbol, units, buy_price, buy_date, country
  - Real Estate: name, address (re-geocodes on save), value, all mortgage fields, photo upload
  - Static (cash/pension/bond): name, value, currency, plus bond fields where applicable
- Save button (primary action), Delete button (secondary, with confirm step)
- A small "Discuss instead" link inside the panel for users who prefer the conversational flow

### Database Impact
- No schema changes
- Every save/delete must write a row to `mutations` (same pattern as the AI flow)
- Use a server action or new API route to enforce the mutation log

### Files Likely to Change
- `src/components/asset-detail/{TradeableDetail,RealEstateDetail,StaticDetail}.tsx` — wire EDIT to open the panel instead of the chat seed
- `src/components/AssetEditor.tsx` (new) — the editor UI, dispatched by asset type
- `src/app/api/assets/route.ts` (new) — PATCH and DELETE endpoints with mutation logging
- `src/lib/hooks.ts` — add a `refetchAssets` trigger after mutations

---

## 2. Daily Snapshots Cron

### Goal
Capture daily net worth snapshots so we can build a net-worth-over-time chart. This unlocks all future trend features and re-enables the percentage indicator on the diary period-summary card (currently hidden because there's no historical baseline).

### Expected behavior
- Vercel Cron job runs once daily, writes a row per user to `snapshots` with `total_value` (EUR) and `breakdown` (jsonb per asset type)
- Trigger should also fire after large mutations (e.g. > 5% net worth change) to avoid stale data
- Backfill not needed for MVP — charts start from launch day
- No UI yet — that's item #3

### Database Impact
- Use the existing `snapshots` table (schema already in place)
- One row per user per day

### Files Likely to Change
- `src/app/api/cron/snapshot/route.ts` (new) — the daily job
- `vercel.json` — add cron config (Vercel Cron is free for one job)
- `src/app/api/chat/route.ts` — fire a snapshot after large mutations

---

## 3. Net Worth Over Time Chart

### Goal
With snapshots populating, render the chart on the Portfolio tab. Unlocks the "this week" / "this month" percentage indicators on the diary card.

### Expected UI
- Simple line chart on the Portfolio tab (between hero and stats)
- Toggle 30 / 90 / 365 days
- Toggle gross vs net
- Reuses the design system colors (amber line, dim grid)

### Database Impact
- None — reads from `snapshots`

### Files Likely to Change
- `src/components/NetWorthChart.tsx` (new) — line chart (Recharts)
- `src/app/page.tsx` — mount the chart between hero and stats
- `src/components/DiaryTab.tsx` — re-enable the percentage indicator on the period summary card now that historical data exists

---

## 4. Decision Diary Improvements

### Goal
The diary is already on the right track post-redesign. Make it more useful as a research tool rather than just a log.

### Expected UI
- **Search** by asset name or context keyword (client-side, diaries won't be huge for years)
- **Group by year** when the timeline gets long
- **"On this day" callout** at the top if any past mutation matches today's date
- Click a mutation → expanded view showing the full conversation that produced it (read-only)
- Optional: ability to add a manual note to an existing mutation entry

### Database Impact
- Add `notes` (text, nullable) column to `mutations`
- No new tables

### Files Likely to Change
- `src/app/diary/page.tsx` — search + group-by-year
- `src/components/DiaryTab.tsx` — "on this day" callout
- `src/components/MutationDetail.tsx` (new) — expanded view modal
- `src/app/api/mutations/[id]/route.ts` (new) — PATCH for notes

---

## 5. Scenario Analysis UI

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
- `src/components/ScenarioBuilder.tsx` (new) — the builder
- `src/app/api/scenarios/route.ts` (new) — CRUD endpoints
- `src/lib/claude.ts` — extend the system prompt to handle scenario context
- New SQL migration for `scenarios` table

### Notes
- The chat assistant already handles scenarios conversationally — this UI complements, not replaces it
- Don't over-design. Two columns (current + scenario), a few editable fields, one comparison panel

---

## Out of Scope for Now

- Dashboard highlights cards (market events, milestones, reflections) — wait until snapshots and chart exist
- Weekly insight email — wait until users actually retain
- Allocation benchmarking — nice-to-have, not core
- Shareable portfolio report — growth feature, not retention
- Mobile native app — web-first
- Tax features — never, not Vesper's lane
- Broker sync / bank integrations — never for MVP, manual + AI-driven is the differentiator
