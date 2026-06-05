# Volnar — Project Handoff

## Product Vision

Volnar is a personal portfolio intelligence web app. It gives investors clarity over their full financial picture through conversation, not forms. The promise: the clarity and confidence that used to require a private banker, available to anyone with a portfolio.

## Target User

Professionals aged 32–55, net worth €100k–€2M, with assets scattered across multiple accounts (broker, crypto, real estate, savings). Currently tracking in spreadsheets or not at all. Not wealthy enough for a private banker. Too complex for a budgeting app.

## Current MVP Goal

A single web dashboard where a user can:
- See their full net worth in one number, including real estate equity (auto-amortized from the user's stated mortgage anchor)
- See net worth trajectory over time on a daily-snapshot chart
- Add, edit, rename, and remove assets through natural conversation — chat is the only modification surface, by design, so every change comes with reasoning captured at the moment of change
- See real-time prices for tradeable assets, aggregated into unified totals (stored native-per-asset, USD as the FX bridge, rendered in the user's display currency — see `technical-decisions.md` → Currency Rules)
- Browse a chronological, append-only diary of every portfolio change with reasoning notes captured at the time of the change
- Drill into any position via a dedicated **read-only** detail page (with a property hub for real estate, including theme-aware map, mortgage projection, and value composition)
- See an AI-built profile of themselves that grows over time — four context fields plus a one-line investor fingerprint
- Read a single AI-generated "Worth knowing" insight on the Portfolio surface, refreshed daily
- Read seven adaptive portfolio **Vitals** (concentration, liquidity posture, leverage, drawdown, real-asset weight, cash & real yield, real growth) on a dedicated tab, plus an NL/EU/world net-worth percentile on Profile
- Explore **what-if scenarios** through chat — a whole-portfolio before→after for buy/sell/shock moves and a forward projection cone — read-only, never a mutation
- Track **pensions as two shapes**: a capital pot (counts toward net worth, with a deterministic projection) or a future income entitlement (off-balance, surfaced as "Future income")
- Switch display currency (EUR / USD / GBP) and theme (Light / Dark) from Profile

## Current Stack

- **Frontend**: Next.js 16 (Turbopack), React, Tailwind CSS, TypeScript
- **Fonts**: Source Serif 4 (serif), Albert Sans (body, tabular numbers via `tnum`), Geist Mono (sparing use)
- **Theme**: two modes (light / dark) via `users.theme`; `auto` is not accepted by the API. Light and dark CSS variable sets in `globals.css`.
- **Accent**: single green (`#4A7C5E`) on a cream + ink palette (light) / warm-black + cream (dark)
- **Database**: Supabase (Postgres) with Row Level Security
- **Auth**: Supabase Auth — Google OAuth + email magic link
- **AI**: Anthropic Claude API (`claude-sonnet-4-6` for the assistant; `claude-haiku-4-5-20251001` for diary summary, profile extraction, and the AI insight band)
- **Analytics**: Vercel Analytics (`@vercel/analytics`) — pageviews + 4 custom pilot events (signup, first_asset_added, first_chat_mutation, return_visit_day2_plus)
- **Error tracking**: Sentry (free tier, graceful no-op when DSN unset)
- **Market data**: Yahoo Finance via server-side proxy
- **FX data**: frankfurter.app (no key, ECB-backed) cached in Postgres with 24h TTL
- **Maps**: OpenFreeMap (no key, MIT-licensed) via MapLibre GL JS, with light + dark style variants
- **Geocoding**: OSM Nominatim (free, rate-limited, server-side only)
- **Asset logos**: cryptocurrency-icons via jsdelivr (crypto), Financial Modeling Prep (stocks/ETFs), inline SVG (real estate, cash/pension wallet, bonds certificate)
- **Cron**: Vercel Cron (two jobs: daily net-worth snapshots at 00:00 UTC; market highlights at 07:00 UTC)
- **Hosting**: Vercel
- **Domain**: app.volnar.nl

## Deployment Info

- Production URL: https://app.volnar.nl
- Auto-deploys from `main` branch on GitHub push
- Environment variables in Vercel dashboard: Supabase URL, anon key, service role key, Anthropic API key, CRON_SECRET, optional Sentry DSN
- Custom domain via CNAME from Bluehost-managed volnar.nl → cname.vercel-dns.com

## Repository

https://github.com/anhtuan810/vesper (repo still named `vesper`; product is Volnar — rename pending)

## High-Level App Structure

```
src/
  app/
    (main)/page.tsx             Portfolio (root route) — route group sharing the desktop shell
    (main)/diary/page.tsx       Diary route
    (main)/profile/page.tsx     Profile route (name title, Perspective, Context, Preferences — currency + theme)
    vitals/page.tsx             Vitals — 7 adaptive portfolio readings
    chat/page.tsx               Full-page chat (mobile); desktop falls back to ChatPopup
    scenarios/page.tsx          Legacy route — redirects to "/" (scenario explore is chat-driven)
    marketing/page.tsx          Public marketing landing
    asset/[id]/page.tsx         Asset detail dispatcher (Tradeable / RealEstate / Pension / Static); read-only
    login/page.tsx              Login screen
    auth/callback/route.ts      OAuth callback
    error.tsx, global-error.tsx Error boundaries
    api/
      chat/route.ts             Claude assistant + portfolio mutations + scenario narration + snapshot trigger (sole modification path)
      messages/route.ts         Chat history fetch with cursor pagination (before=<id>&limit=20)
      prices/route.ts, prices/history{,/batch}/route.ts   Yahoo proxy (native prices) + history
      fx/route.ts               FX rate fetch + cache (frankfurter.app)
      diary-summary/route.ts    Background Claude call for diary summary card
      geocode/route.ts          Server-side Nominatim geocoding (called from /api/chat on real-estate adds)
      snapshots/route.ts        GET — returns user's snapshot series
      dashboard-init/route.ts   Batched Portfolio bootstrap (insight + 1M snapshots + mutations)
      insight/route.ts          "Worth knowing" band — deterministic detectors (portfolio-insights.ts) + Haiku phrasing, 24h cached
      vitals/route.ts, vitals/pulse/route.ts   Vitals compute + pulse sentence
      scenarios/route.ts (+ [id]/, compute/, counterfactual/, project/)   Standalone scenario engine
      property-estimate/route.ts   Indicative NL property value (CBS PBK)
      users/me/route.ts         GET/PATCH preferences (theme, display_currency, profile); DELETE account
      logo/route.ts             Server-side logo proxy (crypto + stock)
      backfill/route.ts         User-invoked price/data backfill
      cron/snapshot/route.ts    Daily net-worth snapshots (00:00 UTC)
      cron/market-highlights/route.ts   Daily market highlights (07:00 UTC)
  components/
    ChatPopup.tsx               Floating chat (desktop); context-aware seed when over /asset/[id]
    BottomNav.tsx               5-tab mobile nav (Portfolio/Vitals/Chat/Diary/Profile)
    NavBar.tsx                  Top nav: first name on right (suppressed on Profile tab), refresh + status dot; no avatar
    NetWorthHero.tsx            Big serif net worth + change pill
    NetWorthChart.tsx           Trajectory chart with range pills (1W/1M/3M/1Y/3Y/All), straight-line segments (no smoothing)
    InsightBand.tsx             "Worth knowing" italic-serif AI insight, links to /chat
    PortfolioTab.tsx            Portfolio page composition
    HoldingsGroup.tsx           Semantic groupings (Property / Public markets / Reserves) with proportional bars
    PositionRow.tsx             Position list row (uses AssetLogo)
    AssetLogo.tsx               Shared logo resolver — wallet/certificate/property SVGs, crypto+stock via /api/logo, monogram fallback
    MiniSparkline.tsx           Inline SVG sparkline
    PriceChart.tsx              Larger chart with time-range tabs
    PriceDisplay.tsx            Currency-aware price formatting
    PropertyMap.tsx             Theme-aware MapLibre + OpenFreeMap, accent green pin, PNG-cached per theme
    MortgageBlock.tsx           Read-only stat rows + payoff projection chart with TODAY marker
    ValueComposition.tsx        Stacked horizontal bar (equity vs mortgage)
    DiaryTab.tsx                Diary list + AI summary card; reads asset names via JOIN
    FormatText.tsx              Markdown-lite rendering for chat messages
    ThemeProvider.tsx           Resolves auto/light/dark, applies data-theme to document root
    asset-detail/
      TradeableDetail.tsx       Stocks / ETFs / crypto / gold — read-only
      RealEstateDetail.tsx      Property hub — read-only, map-only, auto-amortized equity
      StaticDetail.tsx          Cash / bond / other — read-only
      PensionDetail.tsx         Pension dispatcher → capital pot or income entitlement
      PensionCapitalDetail.tsx  Capital (dc) pot — value hero + deterministic projection card
      PensionIncomeDetail.tsx   Income (db/state) — off-balance future income, timeline
      PensionActivity.tsx       Shared pension activity rows ("Added"/"Recorded")
      CryptoVolatilityBlock.tsx 24h volatility (crypto only)
      BondBlock.tsx             Read-only issuer / coupon / maturity / ISIN
      EstimatedValueChart.tsx   Indicative NL property value per-year chart
    vitals/                     VitalsContent + PulseBanner, VitalCard, LibraryExpander, charts/ (7 charts)
    scenario/                   Scenario result cards + ProjectionTeaser
    sections/                   Marketing landing sections
    perspective/
      PerspectiveCard.tsx       NL/EU/world percentile card — Profile-owned; caller supplies the eyebrow
  lib/
    supabase.ts                 DB client + TypeScript types (Asset union incl. pension fields)
    claude.ts (+ prompt-blocks.ts)   System prompt builders (main + onboarding); currency-parameterized; chips; pension intake
    apply-changes.ts            <changes> JSON → DB writes + mutation logging (pure, testable)
    proposal-resolver.ts        Resolves <propose_change> previews (incl. the pension confirmation echo)
    pension.ts, pension-intake.ts   Two-shape helpers; deterministic projectPension + the intake validation gate
    validations.ts              Server-side validation for /api/chat — all-or-nothing, banker's-tone errors
    hooks.ts (+ hooks/{netWorth,vitals,assets}.ts)   React data hooks (useAssets, useDisplayCurrency, useVitals, useNetWorth, …)
    profile-extractor.ts        Background Haiku call — four context fields + fingerprint
    insight-generator.ts, portfolio-insights.ts   "Worth knowing" — deterministic detectors + Haiku phrasing
    mortgage.ts                 Amortization math + computeCurrentBalance(asset, asOf)
    money.ts                    toUsd / toUsdClient, formatMoney, formatMoneyParts — forced nl-NL locale
    fx.ts                       USD-base FX rates (frankfurter.app) + cache
    country-currency.ts         Country → native currency (NL/DE/FR→EUR, US→USD, UK→GBP, fallback EUR)
    snapshot.ts                 writeSnapshot(userId) — shared net-worth snapshot writer
    prices.ts, prices-server.ts GBp normalizer + Yahoo fetch / venue fallback
    cbs-pbk.ts, property-*.ts   Indicative NL property value (CBS PBK)
    vitals/                     7 compute modules + build-inputs.ts + persist.ts + index.ts
    scenario/                   Scenario engine (validate-intent, engine, portfolio-readout, narrate, …)
    chat/                       Agent tool-loop (agent-loop, agent-tools, agent-config) — flag-gated OFF
    geocode.ts, maps.ts         Nominatim wrapper + map URL builders
    tokens.ts                   Design tokens mirrored as TypeScript exports
    use-chat-session.ts         Shared chat state hook; cache strategy, NOT a UX session boundary
    utils.ts, env.ts            Helpers (computeNetWorth, formatDate, …) + env validation
  styles/
    map-light.json              MapLibre style — light theme
    map-dark.json               MapLibre style — dark theme
  middleware.ts                 Auth route protection
  sentry.*                      Sentry initialization

vercel.json                     Cron schedule

docs/                           See docs/README.md for the full index
  current-features.md           What is built and what is fragile
  technical-decisions.md        Stack, schema, patterns, calculation rules
  volnar-project-handoff.md     This file — product vision + high-level map
  redesign-decisions.md         The 11 locked product decisions (frozen)
  next-build-plan.md            Prioritized roadmap
  currency-feature-spec.md      Display-currency history (canonical model now in technical-decisions.md)
  mobile-build.md               iOS Capacitor wrapper
  vitals-*.md / vitals-mockup.html   Vitals build state, metrics, design spec, mockup
  testing-strategies.md         Test-activation plan (deferred)
  *-checks.md / agent-chat-live-eval.md   Manual (live) QA checklists
```

### Files explicitly removed in the migration
- `src/components/AllocationBar.tsx` (PR 15 — proportional bars in HoldingsGroup carry the same information)
- `src/components/asset-detail/InlineEdit.tsx` (PR 18 — Profile context fields became read-only after asset detail pages had already become read-only in PR 4)
- `src/components/asset-detail/DeleteAssetButton.tsx` (PR 4 — Decision 8, chat is sole modification surface)
- `src/components/asset-detail/ContextNotePrompt.tsx` (PR 4 — band-aid for inline edits, no longer needed)
- `src/app/api/assets/[id]/route.ts` (PR 4 — PATCH/DELETE removed; chat is sole modification surface)
- `src/app/api/mutations/[id]/route.ts` (PR 5 — Decision 1, notes are immutable)
- `src/app/settings/page.tsx` (PR 3 — Decision 5, Settings absorbed into Profile)

## Important Product Principles

1. **Chat is the only modification surface.** Adds, edits, renames, removes — all happen through chat, because chat captures the reasoning at the same moment as the change. Asset detail pages are read-only views. Profile context fields are read-only views. There is no public PATCH/DELETE endpoint on `/api/assets/[id]` and no PATCH on `/api/mutations/[id]`. The diary stays append-only and complete; the detail pages stay calm and useful as reference. One sanctioned exception: `POST /api/assets` exists solely for undo-restore — `UndoDeleteToast` uses it to re-create an asset the user just deleted in-session. It still logs a mutation ("Restored after delete"), so the diary stays complete.
2. **Investing tone, not trading.** "Growth" not "P&L". "Added" not "entry". No win/loss ratios. No gamification.
3. **Professional language.** No emojis. No exclamation marks. No "awesome / great / cool". Speak like a private banker.
4. **Asset-agnostic.** No country-specific features. No asset-type-specific logic outside detail dispatchers and icon resolution. The intelligence is in the AI layer.
5. **Memory matters.** The investor profile builds itself over time. Four lasting context fields plus a one-line fingerprint, refined after every conversation. Field labels in sentence case.
6. **Backend is source of truth.** AI parses and explains. Deterministic code calculates and validates.
7. **Privacy over community.** No social features. No portfolio sharing.
8. **Display currency is per-user.** Storage is native-per-asset (`assets.value` in the asset's own currency). USD is the bridge for aggregation (`snapshots.total_value`, `mutations.portfolio_total`). EUR and GBP are display-only at render time. Each user picks a display currency (EUR / USD / GBP). Real estate carries its native currency by country for transparency. Number formatting is forced to nl-NL locale across all currencies for brand consistency.
9. **The redesign mockups are the literal source of truth for visual presentation** (kept in project knowledge, not the repo). When a mockup and a locked decision conflict, the user decides; otherwise, the mockup wins. Deliberate deviations from the mockup happen (e.g. PR 21 sized BottomNav icons smaller than the mockup specified; avatar was removed from NavBar and Profile entirely) and are noted in code comments or this doc.
10. **Decisions over numbers.** The diary is a log of decisions and reasoning, not just a transaction history. Notes are write-once. Pure renames are metadata and don't log. Diary entries display each asset's current name via JOIN — the *thing* has one identity.
11. **Mortgage balance auto-amortizes invisibly.** The user enters mortgage values once. After that, balance and equity move silently month by month. Only notable events (extra payment, refinance, value update) are logged.

## What Volnar Is NOT Trying to Be Yet

- Not a tax tool.
- Not a trading platform. No order execution, no broker integration.
- Not a budgeting app. No spending tracking, no bank feeds.
- Not a robo-advisor. No recommendations.
- Not a community. No social features, no portfolio sharing.
- Not country-specific. No NL-only features at launch.
- Not a native mobile app. Web-first, mobile-first responsive.
