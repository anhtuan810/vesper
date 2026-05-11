# Vesper — Project Handoff

## Product Vision

Vesper is a personal portfolio intelligence web app. It gives investors clarity over their full financial picture through conversation, not forms. The promise: the clarity and confidence that used to require a private banker, available to anyone with a portfolio.

## Target User

Professionals aged 32–55, net worth €100k–€2M, with assets scattered across multiple accounts (broker, crypto, real estate, savings). Currently tracking in spreadsheets or not at all. Not wealthy enough for a private banker. Too complex for a budgeting app.

## Current MVP Goal

A single web dashboard where a user can:
- See their full net worth in one number, including real estate equity
- See net worth trajectory over time on a daily-snapshot chart
- Add, edit, and remove assets through natural conversation OR direct inline edits on detail pages
- See real-time prices for tradeable assets, converted to a single canonical unit for unified totals (EUR in storage; user's display currency at render — see `currency-feature-spec.md`)
- Browse a chronological diary of every portfolio change with reasoning notes
- Drill into any position via a dedicated detail page (with a property hub for real estate, including map, mortgage projection, and value composition)
- See an AI-built profile of themselves that grows over time

The MVP supports both conversation-first and direct-edit workflows. Adding assets always happens through chat (it captures context, handles screenshots, infers types). Editing and deleting happen inline on detail pages — every asset type now has full inline CRUD parity.

## Current Stack

- **Frontend**: Next.js 16 (Turbopack), React, Tailwind CSS, TypeScript
- **Fonts**: Source Serif 4 (serif, hero numbers and section titles), Albert Sans (body, labels, nav). Geist Mono is no longer used in UI chrome.
- **Database**: Supabase (Postgres) with Row Level Security
- **Auth**: Supabase Auth — Google OAuth + email magic link
- **AI**: Anthropic Claude API (`claude-sonnet-4-6` for assistant, `claude-haiku-4-5-20251001` for summaries)
- **Error tracking**: Sentry (free tier, graceful no-op when DSN unset)
- **Market Data**: Yahoo Finance via server-side proxy
- **FX Data**: frankfurter.app (no key, ECB-backed) cached in Postgres with 24h TTL
- **Maps**: OpenFreeMap (no key, MIT-licensed) with MapLibre GL JS
- **Geocoding**: OSM Nominatim (free, rate-limited, server-side only)
- **Asset Logos**: cryptocurrency-icons via jsdelivr (crypto), Financial Modeling Prep (stocks/ETFs), inline SVG (real estate)
- **Cron**: Vercel Cron (one job: daily snapshots at midnight UTC)
- **Hosting**: Vercel
- **Domain**: app.novahub.nl

## Deployment Info

- Production URL: https://app.novahub.nl
- Auto-deploys from `main` branch on GitHub push
- Environment variables in Vercel dashboard (Supabase URL, anon key, service role key, Anthropic API key, CRON_SECRET, optional Sentry DSN)
- Custom domain via CNAME from Bluehost-managed novahub.nl → cname.vercel-dns.com

## Repository

https://github.com/anhtuan810/vesper

## High-Level App Structure

```
src/
  app/
    page.tsx                    Portfolio (root route, mobile + desktop)
    diary/page.tsx              Diary route
    chat/page.tsx               Full-page chat (mobile); desktop falls back to ChatPopup
    profile/page.tsx            Profile route
    asset/[id]/page.tsx         Asset detail dispatcher (Tradeable / RealEstate / Static)
    login/page.tsx              Login screen
    auth/callback/route.ts      OAuth callback
    error.tsx                   Per-route error boundary
    global-error.tsx            Root error boundary
    api/
      chat/route.ts             Claude assistant + portfolio mutations + snapshot trigger
      prices/route.ts           Yahoo Finance proxy with EUR conversion
      prices/history/route.ts   Historical price series for charts
      prices/history/batch/route.ts   Batch historical fetch for sparkline grid
      fx/route.ts               FX rate fetch + cache (frankfurter.app)
      diary-summary/route.ts    Background Claude call for diary summary card
      geocode/route.ts          Server-side Nominatim geocoding
      snapshots/route.ts        GET — returns user's snapshot series for the chart
      cron/snapshot/route.ts    Daily cron — writes snapshots for all users
      backfill/route.ts         One-time backfill for zero-value mutations (legacy data fix)
  components/
    ChatPopup.tsx               Floating chat (desktop)
    BottomNav.tsx               4-tab mobile nav
    NavBar.tsx                  Top nav with refresh button + status dot
    NetWorthHero.tsx            Big serif net worth + change pill (vs 1 month ago)
    NetWorthChart.tsx           Net worth trajectory chart with range pills
    AllocationBar.tsx           Segmented horizontal allocation bar
    PortfolioTab.tsx            Portfolio page composition
    PositionRow.tsx             Position list row (uses AssetLogo)
    AssetLogo.tsx               Shared logo resolver — crypto CDN, stock CDN, real-estate SVG, monogram fallback
    MiniSparkline.tsx           Inline SVG sparkline
    PriceChart.tsx              Larger chart with time-range tabs
    PriceDisplay.tsx            Currency-aware price formatting with superscript symbol
    PropertyMap.tsx             OpenFreeMap with amber pin, cached as PNG after first render
    MortgageBlock.tsx           Stat grid with inline edits + payoff chart with TODAY marker
    ValueComposition.tsx        Stacked horizontal bar (equity vs mortgage)
    DiaryTab.tsx                Diary list + slimmed AI summary card with pulsing V loading state
    FormatText.tsx              Markdown-lite rendering for chat messages
    asset-detail/
      TradeableDetail.tsx       Stocks / ETFs / crypto / gold layout (read-only)
      RealEstateDetail.tsx      Property hub layout (read-only)
      StaticDetail.tsx          Cash / pension / bond / other layout (read-only)
      CryptoVolatilityBlock.tsx 24h volatility (crypto only)
      BondBlock.tsx             Issuer / coupon / maturity / ISIN display (bonds only)
  lib/
    supabase.ts                 DB client + TypeScript types (Asset, Mutation with units, etc.)
    claude.ts                   System prompt builders (main + onboarding); EUR-parameterized; supports rename via new_name
    hooks.ts                    useUser, useAssets, useProfile, useSignOut, useLivePrice, usePriceHistory, useSparklines
    profile-extractor.ts        Background profile extraction (Haiku)
    projection.ts               Milestone calculator (currency-aware)
    mortgage.ts                 Annuity / linear / interest-only payoff math
    snapshot.ts                 writeSnapshot(userId) — shared writer for cron + inline triggers
    maps.ts                     Google Maps URL builders (Street View, etc.)
    geocode.ts                  Server-side Nominatim wrapper with rate limiting
    tokens.ts                   Design tokens mirrored as TypeScript exports
    prices.ts                   GBp normalizer for Yahoo penny prices + historical fetch
    use-chat-session.ts         Shared chat state hook for ChatPopup and /chat
    utils.ts                    fmt(), fmtAmount(), formatDate (drops year for current-year), getWarnings, etc.
    env.ts                      Environment variable validation
  styles/
    map-dark.json               MapLibre style for OpenFreeMap (dark theme)
  middleware.ts                 Auth route protection
  sentry.*                      Sentry initialization (server, client, edge)

vercel.json                     Cron schedule

docs/
  redesign_mockups/
    portfolio.html              Portfolio page reference
    diary.html                  Diary page reference
    chat.html                   Chat page reference
    profile.html                Profile page reference
    tradeable-detail.html       Tradeable asset detail reference
    real-estate-detail.html     Real Estate detail page reference
    static-detail.html          Static asset detail reference
    bond-detail.html            Bond detail reference
  redesign-brief.md             Source of truth for the redesign (Phases 1–6)
  currency-feature-spec.md      Source of truth for display currency parameterization (Phases A–D)
  vesper-project-handoff.md     This file
  current-features.md           What is built and what is fragile
  technical-decisions.md        Stack, schema, patterns
  next-build-plan.md            Prioritized roadmap
```

## Important Product Principles

1. **Chat is the only modification surface**. Adding, editing, and removing assets all happen through chat — where the act of stating the change captures the reasoning at the moment it happens. Asset detail pages and other views display data but never mutate it. There is one code path for changes: the chat route.
2. **Investing tone, not trading**. Use "growth" not "P&L". Use "added" not "entry". No win/loss ratios. No gamification.
3. **Professional language**. No emojis. No exclamation marks. No "awesome / great / cool". Speak like a private banker.
4. **Asset-agnostic**. No country-specific features. No asset-type-specific logic outside detail dispatchers. The intelligence is in the AI layer.
5. **Memory matters**. The investor profile builds itself over time. Every conversation makes the assistant smarter about the user.
6. **Backend is source of truth**. AI parses and explains. Deterministic code calculates and validates.
7. **Privacy over community**. No social features. No portfolio sharing. Like a private banker, not a forum.
8. **Display currency is per-user**. Storage is EUR-equivalent (canonical unit, FX pivot). Each user picks a display currency (EUR / USD / GBP at launch); every rendered number reflects it. Real estate carries its own native currency by location for transparency. The detailed plan lives in `currency-feature-spec.md`.
9. **Decisions over numbers**. The diary is a log of decisions and reasoning, not just a transaction history. Unit-based deltas for trades, value-based for everything else, optional notes on every mutation.

## What Vesper Is NOT Trying to Be Yet

- Not a tax tool. No tax filing, no tax advice, no Box 3 calculator.
- Not a trading platform. No order execution, no broker integration.
- Not a budgeting app. No spending tracking, no transaction categorization, no bank feeds.
- Not a robo-advisor. No automatic rebalancing, no investment recommendations.
- Not a community. No social features, no portfolio sharing, no copy trading.
- Not country-specific. No NL-only features at launch (pension tracking, WOZ lookup, etc. — all out of scope).
- Not a mobile app. Web-first, mobile-first responsive. iOS/Android come later if at all.
