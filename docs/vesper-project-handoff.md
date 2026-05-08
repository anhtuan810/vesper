# Vesper — Project Handoff

## Product Vision

Vesper is a personal portfolio intelligence web app. It gives investors clarity over their full financial picture through conversation, not forms. The promise: the clarity and confidence that used to require a private banker, available to anyone with a portfolio.

## Target User

Professionals aged 32–55, net worth €100k–€2M, with assets scattered across multiple accounts (broker, crypto, real estate, savings). Currently tracking in spreadsheets or not at all. Not wealthy enough for a private banker. Too complex for a budgeting app.

## Current MVP Goal

A single web dashboard where a user can:
- See their full net worth in one number, including real estate equity
- Add, edit, and remove assets through natural conversation
- See real-time prices for tradeable assets, converted to EUR for unified totals
- Browse a chronological diary of every portfolio change
- Drill into any position via a dedicated detail page (with a property hub for real estate, including map, mortgage projection, and value composition)
- See an AI-built profile of themselves that grows over time

The MVP is conversation-first — there are no dedicated forms for adding assets. Edits happen through the chat assistant, including from the EDIT button on each asset detail page (which currently seeds a pre-filled message into the chat).

## Current Stack

- **Frontend**: Next.js 16 (Turbopack), React, Tailwind CSS, TypeScript
- **Database**: Supabase (Postgres) with Row Level Security
- **Auth**: Supabase Auth — Google OAuth + email magic link
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **Market Data**: Yahoo Finance via server-side proxy
- **FX Data**: frankfurter.app (no key, ECB-backed) cached in Postgres with 24h TTL
- **Maps**: OpenFreeMap (no key, MIT-licensed) with MapLibre GL JS
- **Geocoding**: OSM Nominatim (free, rate-limited)
- **Hosting**: Vercel
- **Domain**: app.novahub.nl

## Deployment Info

- Production URL: https://app.novahub.nl
- Auto-deploys from `main` branch on GitHub push
- Environment variables in Vercel dashboard (Supabase URL, anon key, service role key, Anthropic API key)
- Custom domain via CNAME from Bluehost-managed novahub.nl → cname.vercel-dns.com

## Repository

https://github.com/anhtuan810/vesper

## High-Level App Structure

```
src/
  app/
    page.tsx                    Portfolio (root route, mobile + desktop)
    diary/page.tsx              Diary route (Phase 3 split)
    chat/page.tsx               Full-page chat (mobile); desktop falls back to ChatPopup
    profile/page.tsx            Profile route (Phase 3 split)
    asset/[id]/page.tsx         Asset detail dispatcher (Tradeable / RealEstate / Static)
    login/page.tsx              Login screen
    auth/callback/route.ts      OAuth callback
    api/
      chat/route.ts             Claude assistant + portfolio mutations
      prices/route.ts           Yahoo Finance proxy with EUR conversion
      prices/history/route.ts   Historical price series for charts
      fx/route.ts               FX rate fetch + cache (frankfurter.app)
      diary-summary/route.ts    Background Claude call for diary summary card
      geocode/route.ts          Server-side Nominatim geocoding
  components/
    ChatPopup.tsx               Floating chat (desktop)
    BottomNav.tsx               4-tab mobile nav
    NetWorthHero.tsx            Big serif net worth + change pill
    AllocationBar.tsx           Segmented horizontal allocation bar
    PositionRow.tsx             Position list row (icon, sparkline, value, change)
    MiniSparkline.tsx           Inline SVG sparkline
    PriceChart.tsx              Larger chart with time-range tabs
    PropertyMap.tsx             OpenFreeMap with amber pin, cached as PNG after first render
    MortgageBlock.tsx           Stat grid + payoff chart with TODAY marker
    ValueComposition.tsx        Stacked horizontal bar (equity vs mortgage)
    DiaryTab.tsx                Diary list and summary card rendering
    DonutChart.tsx              Legacy; replaced by AllocationBar in Phase 2
    asset-detail/
      TradeableDetail.tsx       Stocks / ETFs / crypto / gold layout
      RealEstateDetail.tsx      Property hub layout
      StaticDetail.tsx          Cash / pension / bond / other layout
      CryptoVolatilityBlock.tsx 24h volatility (crypto only)
      BondBlock.tsx             Issuer / coupon / maturity / ISIN (bonds only)
  lib/
    supabase.ts                 DB client + TypeScript types (Asset, Mutation, etc.)
    claude.ts                   System prompt builders (main + onboarding); EUR-parameterized
    hooks.ts                    useUser, useAssets, useProfile, useSignOut, useLivePrice, usePriceHistory
    profile-extractor.ts        Background profile extraction
    projection.ts               Milestone calculator (currency-aware)
    mortgage.ts                 Annuity / linear / interest-only payoff math
    maps.ts                     Google Maps URL builders (Street View, etc.)
    tokens.ts                   Design tokens mirrored as TypeScript exports
    prices.ts                   GBp normalizer for Yahoo penny prices
    utils.ts                    fmt() and fmtAmount() (currency-aware)
  middleware.ts                 Auth route protection

docs/
  redesign-mockups/
    main-screens.html           Canonical visual reference for Portfolio / Diary / Chat
    real-estate-detail.html     Real Estate detail page anatomy
  redesign-brief.md             Source of truth for the redesign (Phases 1–6)
  vesper-project-handoff.md     This file
  current-features.md           What is built and what is fragile
  technical-decisions.md        Stack, schema, patterns
  next-build-plan.md            Prioritized roadmap
```

## Important Product Principles

1. **Conversation-first**. Everything happens through the chat assistant. No dedicated forms for adding assets.
2. **Investing tone, not trading**. Use "growth" not "P&L". Use "added" not "entry". No win/loss ratios. No gamification.
3. **Professional language**. No emojis. No exclamation marks. No "awesome / great / cool". Speak like a private banker.
4. **Asset-agnostic**. No country-specific features. No asset-type-specific logic outside detail dispatchers. The intelligence is in the AI layer.
5. **Memory matters**. The investor profile builds itself over time. Every conversation makes the assistant smarter about the user.
6. **Backend is source of truth**. AI parses and explains. Deterministic code calculates and validates.
7. **Privacy over community**. No social features. No portfolio sharing. Like a private banker, not a forum.
8. **EUR is the user-facing display currency**. Native currency is shown as transparency on detail pages but never as the primary number.

## What Vesper Is NOT Trying to Be Yet

- Not a tax tool. No tax filing, no tax advice, no Box 3 calculator.
- Not a trading platform. No order execution, no broker integration.
- Not a budgeting app. No spending tracking, no transaction categorization, no bank feeds.
- Not a robo-advisor. No automatic rebalancing, no investment recommendations.
- Not a community. No social features, no portfolio sharing, no copy trading.
- Not country-specific. No NL-only features at launch (pension tracking, WOZ lookup, etc. — all out of scope).
- Not a mobile app. Web-first, mobile-first responsive. iOS/Android come later if at all.
