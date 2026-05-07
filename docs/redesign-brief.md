# Vesper UI Redesign — Implementation Brief

This document is the source of truth for the Vesper UI redesign. Read it in full before making any changes. It defines the design system, the phased rollout, and the constraints.

## Working principles (read first)

- **Move fast, MVP-first.** Ship the smallest correct version of each phase.
- **Do not overengineer.** No premature abstractions. No factories, no managers, no enterprise patterns.
- **Backend is the source of truth.** The database holds reality. The UI reflects it.
- **AI parses and explains. Deterministic code calculates and validates.** Never let the LLM be responsible for math, totals, or critical state.
- **Prefer small, focused changes.** One phase per branch. One PR per phase.
- **Do not refactor unrelated files.** If a file isn't touched by the phase, leave it alone.
- **List files changed at the end of every phase**, with a one-line description of what changed in each.
- **Mention required SQL separately** in a clearly labeled section. Never bury schema changes inside code blocks.
- **Every manual or AI-driven portfolio change must create a row in the `mutations` table.** This rule is invariant.
- **Match existing repo patterns** before introducing new ones.
- **Be direct.** No hedging, no apologies, no padding. The founder is technical and busy.

## Style

- Professional language. No emojis. No exclamation marks. No "awesome / great / perfect".
- Code in TypeScript, React (App Router), Tailwind.
- Match existing patterns in the codebase before introducing new ones.

## Stack assumptions

- Next.js 16 (Turbopack), App Router
- React with TypeScript
- Tailwind CSS
- Supabase Postgres with RLS
- Anthropic Claude (`claude-sonnet-4-6`)
- Yahoo Finance via server-side proxy
- Vercel hosting

---

# Design system (the source of truth)

These are the design tokens. They live in `src/app/globals.css` as CSS variables and are exposed to Tailwind via `tailwind.config.ts`. Every component must use these, not raw values.

## Colors

```css
--bg: #0A0A0B;                   /* canvas, warm-black */
--surface: #14141A;              /* cards, inputs */
--surface-elev: #1C1C24;         /* raised surfaces */
--border: rgba(255,255,255,0.06);
--border-strong: rgba(255,255,255,0.10);
--text: #F5F4EE;                 /* primary copy, warm off-white */
--text-dim: #8A8A93;             /* secondary copy */
--text-faint: #54545E;           /* labels, hints */
--accent: #D4A574;               /* the signature, soft gold */
--accent-soft: rgba(212,165,116,0.12);
--positive: #6BAA75;             /* muted sage */
--negative: #C97A6E;             /* muted coral */
```

## Typography

```css
--serif: 'Fraunces', Georgia, serif;
--sans: 'Plus Jakarta Sans', system-ui, sans-serif;
--mono: 'Geist Mono', 'SF Mono', monospace;
```

**Hierarchy is rigid:**
- **Serif (Fraunces)** for hero numbers, section titles, asset names, italic diary context. Light weight 300, optical size 144, slightly negative tracking.
- **Sans (Plus Jakarta Sans)** for body copy and labels.
- **Mono (Geist Mono)** for all financial figures, dates, percentages, metadata.

Never break the split. Numbers are not set in serif anywhere except the hero net worth and detail page hero values.

## Visual rules

- **Single accent color.** Amber (#D4A574) is the only chromatic moment beyond green/coral semantic colors. Used for: chart line, active states, brand dot, primary CTA, and editorial highlights only.
- **No donut charts.** Allocation is shown as a horizontal segmented bar.
- **Mini sparklines** replace day-change badges in position rows.
- **Diary feels like a journal.** Italic serif dates, monospace action tags, italic body for context lines.
- **No emojis. No exclamation marks.** Anywhere. Including microcopy.

## Reference mockups

Two HTML mockup files contain the canonical visual reference:
- `docs/redesign-mockups/main-screens.html` — Portfolio, position detail, diary, chat, plus desktop expansion and full token system
- `docs/redesign-mockups/real-estate-detail.html` — Real estate detail page anatomy and free-map implementation options

Open these in a browser and reference them when in doubt about layout, spacing, or component composition.

---

# Phased rollout

Six phases. Each is one PR. Phases 1–3 must run in order. Phases 4–6 can run in any order or in parallel after Phase 3 ships.

## Phase 1 · Design tokens + font loading

**Goal:** Wire the design system into the codebase. Nothing visible changes — but every later phase becomes mechanical.

**Files to change:**

| File | Change |
|---|---|
| `src/app/layout.tsx` | Add Google Fonts `<link>` for Fraunces, Geist Mono. Plus Jakarta Sans should already be loaded — verify and keep. Set body background to `var(--bg)` and base text color to `var(--text)`. |
| `src/app/globals.css` | Add the full token block (colors + typography variables) to `:root`. Set `body { background: var(--bg); color: var(--text); font-family: var(--sans); }`. |
| `tailwind.config.ts` | Extend theme to expose tokens as Tailwind utilities: `bg-surface`, `text-fg`, `text-dim`, `text-faint`, `text-accent`, `border-default`, `font-serif`, `font-mono`, etc. |
| `src/lib/tokens.ts` *(new)* | Mirror the color values as a TypeScript export, for use in inline JS contexts (Recharts colors, etc.). |

**Acceptance criteria:**
- App still renders identically to before (visually nothing changes).
- `var(--accent)` resolves to `#D4A574` everywhere.
- A new component using `bg-surface` and `text-fg` Tailwind classes renders correctly.

**Time estimate:** 2 hours.

**Out of scope:** any visual change to existing components. That happens in Phase 2.

---

## Phase 2 · Visual refresh of existing pages

**Goal:** The redesign becomes visible. Same routes, same functionality — new look.

**Files to change:**

| File | Change |
|---|---|
| `src/app/page.tsx` | Replace inline color and font classes with new tokens. Net worth hero in serif. Replace donut chart with segmented allocation bar. Restyle positions table as new row layout. Restyle stat cards. Tabs still switch via state — routing happens in Phase 3. |
| `src/components/ChatPopup.tsx` | Restyle bubbles (user vs assistant), restyle the `<changes>` block as the bordered amber card, add chip-style suggestions row. |
| `src/components/AllocationBar.tsx` *(new)* | Segmented horizontal bar component. Takes an array of `{ label, value, color }`, renders the bar plus the legend rows below. |
| `src/components/PositionRow.tsx` *(new)* | Row with icon (3-letter monogram), name, sub-line (units · country · price), sparkline, value, change. Clickable target — route wired in Phase 4. |
| `src/components/MiniSparkline.tsx` *(new)* | SVG sparkline. Accepts `prices: number[]`. Empty / hidden when no data — sparkline data sourcing happens in Phase 4. |
| `src/components/NetWorthHero.tsx` *(new)* | Large serif net worth + change pill + change label. |

**Acceptance criteria:**
- Portfolio tab matches the mockup at `docs/redesign-mockups/main-screens.html` (first phone).
- Diary tab uses the new entry styling.
- Chat popup matches the chat phone in the mockup.
- All existing functionality works: refresh, mutations, profile, sign-out.
- No new Supabase queries.
- Mutation logging rule unchanged — chat-driven mutations still write to `mutations`.

**Risks:**
- `src/app/page.tsx` is large. Extract components in this PR rather than in a separate cleanup PR.
- Sparklines render empty here — that's intentional. Phase 4 will provide historical price data.

**Time estimate:** 1.5–2 days.

---

## Phase 3 · Bottom nav + route restructure

**Goal:** Move from "one page with three tabs" to actual routes. The app starts to feel mobile-native.

**Files to change:**

| File | Change |
|---|---|
| `src/app/page.tsx` | Strip down to just the Portfolio content — remove tab switching state. |
| `src/app/diary/page.tsx` *(new)* | Move Diary content here. |
| `src/app/chat/page.tsx` *(new)* | Full-screen chat page for mobile. **Decision:** keep `ChatPopup` as a floating widget on desktop, use this full-page version on mobile (detect via Tailwind breakpoint, not user agent). |
| `src/app/profile/page.tsx` *(new)* | Move Profile content here. |
| `src/app/layout.tsx` | Mount `<BottomNav />` below `{children}`, hidden at `md` breakpoint and above. |
| `src/components/BottomNav.tsx` *(new)* | The 4-tab bottom nav (Portfolio / Diary / Chat / Profile) with active state from `usePathname()`. |

**Acceptance criteria:**
- Each tab has its own URL.
- Bottom nav shows on mobile (under 768px) and hides on desktop.
- Active tab is highlighted in amber.
- Browser back button works between tabs.
- Direct linking to `/diary`, `/chat`, `/profile` works.

**Time estimate:** 1 day.

**Out of scope:** any new content on these pages. We're moving existing content, not changing it.

---

## Phase 4 · Asset detail — Tradeable variant

**Goal:** First new page type. Stocks, ETFs, crypto, gold all share this layout.

**Files to change:**

| File | Change |
|---|---|
| `src/app/asset/[id]/page.tsx` *(new)* | Server component. Fetches asset by ID. Dispatches to the correct detail layout based on `asset.type`. For now, only the Tradeable variant exists — others render a placeholder. |
| `src/components/asset-detail/TradeableDetail.tsx` *(new)* | Layout: header with icon and name, big price, change pill, time-range tabs, full price chart, metric grid (units, avg buy, live price, total return), recent activity scoped to this asset, Edit / Discuss CTAs. |
| `src/components/asset-detail/CryptoVolatilityBlock.tsx` *(new)* | Conditional 24h volatility block. Only renders when `asset.type === 'crypto'`. Hidden for stocks/ETFs/gold. |
| `src/components/PriceChart.tsx` *(new)* | Larger version of `MiniSparkline` with time-range tabs (1D / 1W / 1M / 3M / 1Y / ALL). Uses Recharts or pure SVG — match what's already in the codebase. |
| `src/app/api/prices/history/route.ts` *(new)* | Server proxy to Yahoo `v8/finance/chart` endpoint. Takes `symbol` and `range`, returns array of `{ timestamp, close }`. Cache responses for 5 minutes. |
| `src/lib/hooks.ts` | Add `usePriceHistory(symbol, range)` hook. |
| `src/app/page.tsx` | Make `PositionRow` clickable, route to `/asset/[id]`. |

**Acceptance criteria:**
- Tapping any tradeable position on the dashboard opens its detail page.
- Detail page shows live price, total return, units, average buy price.
- Time-range tabs switch the chart smoothly.
- Crypto positions show the volatility block; stocks do not.
- Crypto positions hide the country field.
- Sparklines on the dashboard now render with real data using the same hook.

**Time estimate:** 2 days.

**Out of scope:** real estate detail, static asset detail. Both come in later phases.

---

## Phase 5 · Asset detail — Real Estate

**Goal:** The most distinct asset detail page. Property hub, not just a row.

**Manual steps required before this phase:**

1. Create a Supabase Storage bucket named `property-photos`. RLS policy: users can read/write only files prefixed with their own `user_id`.
2. Confirm OpenFreeMap as the map provider (free, no API key, MIT-licensed). Fallback option: OSM Static Maps. **Both are free and require no signup.** Do not use Google Maps Static API or Mapbox without explicit approval — they have paid tiers.

**Schema migration (run in Supabase SQL editor):**

```sql
ALTER TABLE assets
  ADD COLUMN address text,
  ADD COLUMN latitude numeric,
  ADD COLUMN longitude numeric,
  ADD COLUMN photo_url text,
  ADD COLUMN property_type text,
  ADD COLUMN size_sqm numeric;
```

All columns nullable. No backfill needed.

**Files to change:**

| File | Change |
|---|---|
| `src/lib/supabase.ts` | Update the `Asset` type with the new fields. |
| `src/lib/mortgage.ts` *(new)* | Pure functions for payoff projection. Three modes: annuity, linear, interest-only. Returns `{ remainingMonths, payoffDate, totalInterestRemaining, balanceCurve: { date, balance }[] }`. No state, no I/O. |
| `src/components/asset-detail/RealEstateDetail.tsx` *(new)* | The Real Estate layout per the mockup at `docs/redesign-mockups/real-estate-detail.html`. |
| `src/components/PropertyMap.tsx` *(new)* | Renders OpenFreeMap with MapLibre GL JS. Applies a custom dark style matching the design tokens. Drops an amber pin at lat/lng. After first render, captures `map.getCanvas().toDataURL()` and uploads to `property-photos/<user_id>/<asset_id>.png` so subsequent loads serve a cached image. |
| `src/components/MortgageBlock.tsx` *(new)* | Stat grid (balance, rate, monthly, type) + payoff chart with TODAY marker + sub-stats (paid to date, interest paid, time remaining, mortgage-free date). |
| `src/components/ValueComposition.tsx` *(new)* | Stacked horizontal bar showing equity vs mortgage as proportion of property value. |
| `src/lib/maps.ts` *(new)* | Helpers for building Google Maps street view URLs from lat/lng or address. |
| `src/app/api/geocode/route.ts` *(new)* | Server-side geocoding using OSM Nominatim (free, rate-limited). Takes address, returns lat/lng. Used when user enters a property address. |
| `src/app/asset/[id]/page.tsx` | Add the real estate dispatch. |

**Acceptance criteria:**
- Tapping a real estate position opens the property hub.
- Map renders even when no photo has been uploaded.
- Tapping the photo or address opens Google Maps street view at the property's location.
- Mortgage block shows correct payoff projection for annuity mortgages.
- Linear mortgages render a straight line; interest-only mortgages show "—" for mortgage-free date.
- Future slots (Valuation history, Cash flow) render as dashed-border placeholders.
- Editing the property logs a mutation as usual.

**Risks:**
- Schema migration is permanent. Review the full Phase 5 scope before running the migration.
- Map rendering can be slow on first load — caching the PNG is essential.
- Geocoding is rate-limited (Nominatim allows 1 request/second). Cache the result on the asset row.

**Time estimate:** 2–3 days.

---

## Phase 6 · Asset detail — Static + bond block

**Goal:** Cover the remaining asset types. Cash, pension, bonds, other.

**Schema migration:**

```sql
ALTER TABLE assets
  ADD COLUMN coupon_rate numeric,
  ADD COLUMN maturity_date date,
  ADD COLUMN issuer text,
  ADD COLUMN isin text;
```

All nullable. Bond-specific fields, used only when `type = 'bonds'`.

**Files to change:**

| File | Change |
|---|---|
| `src/lib/supabase.ts` | Update the `Asset` type. |
| `src/components/asset-detail/StaticDetail.tsx` *(new)* | Minimal layout: balance hero, currency, optional rate, scoped activity. No chart, no symbol, no live price. |
| `src/components/asset-detail/BondBlock.tsx` *(new)* | Issuer, coupon rate, maturity date, ISIN. Computed time-to-maturity and annual income. Only renders when `type === 'bonds'`. |
| `src/app/asset/[id]/page.tsx` | Add the static + bond dispatch. |

**Acceptance criteria:**
- Cash, pension, bonds, other positions all open a working detail page.
- Bonds show the bond block; cash/pension/other do not.
- Editing logs a mutation.

**Time estimate:** 1 day.

---

# Always-on rules

These apply to every phase, every PR, every commit:

1. **Mutation logging.** Any code path that changes an asset (add/edit/remove) must write a row to `mutations`. This includes manual UI changes added in any phase.
2. **No off-topic logic in `claude.ts`.** The system prompt's strict topic boundary stays intact.
3. **No emojis. No exclamation marks. No "awesome / great / perfect" microcopy.**
4. **No new dependencies without justification.** Use what's already in `package.json`. The exceptions for this redesign: MapLibre GL JS (Phase 5 only), Recharts if not already installed (Phase 2 / Phase 4).
5. **Do not refactor unrelated files.** If a file isn't touched by the phase, leave it alone.
6. **Run `pnpm dev` and verify the app boots before committing.** Phase 1 should produce zero visual regressions.
7. **Match existing patterns.** If the codebase uses a specific way to define types, hooks, or API routes, follow it.

---

# Starting the work

When ready to start Phase 1:

> "Read `docs/redesign-brief.md` and execute Phase 1. Do not start Phase 2 yet."

Each subsequent phase is a separate session, started with:

> "Read `docs/redesign-brief.md` and execute Phase N."

Wait for review and merge between phases. Do not chain phases in one session.
