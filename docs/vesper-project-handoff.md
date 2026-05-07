# Vesper — Project Handoff

## Product Vision

Vesper is a personal portfolio intelligence web app. It gives investors clarity over their full financial picture through conversation, not forms. The promise: the clarity and confidence that used to require a private banker, available to anyone with a portfolio.

## Target User

Professionals aged 32–55, net worth €100k–€2M, with assets scattered across multiple accounts (broker, crypto, real estate, savings). Currently tracking in spreadsheets or not at all. Not wealthy enough for a private banker. Too complex for a budgeting app.

## Current MVP Goal

A single web dashboard where a user can:
- See their full net worth in one number, including real estate equity
- Add, edit, and remove assets through natural conversation
- See real-time prices for tradeable assets
- Browse a chronological diary of every portfolio change
- See an AI-built profile of themselves that grows over time

The MVP is conversation-first — there are no forms for adding assets. Everything happens through the chat assistant.

## Current Stack

- **Frontend**: Next.js 16 (Turbopack), React, Tailwind CSS, TypeScript
- **Database**: Supabase (Postgres) with Row Level Security
- **Auth**: Supabase Auth — Google OAuth + email magic link
- **AI**: Anthropic Claude API (`claude-sonnet-4-6`)
- **Market Data**: Yahoo Finance via server-side proxy
- **Hosting**: Vercel
- **Domain**: app.novahub.nl

## Deployment Info

- Production URL: https://app.novahub.nl
- Auto-deploys from `main` branch on GitHub push
- Environment variables set in Vercel dashboard (Supabase URL, anon key, service role key, Anthropic API key)
- Custom domain via CNAME from Bluehost-managed novahub.nl → cname.vercel-dns.com

## Repository

https://github.com/anhtuan810/vesper

## High-Level App Structure

```
src/
  app/
    page.tsx                    Main dashboard (Portfolio / Diary / Profile tabs)
    login/page.tsx              Login screen
    auth/callback/route.ts      OAuth callback handler
    api/
      chat/route.ts             Claude backend (assistant + portfolio mutations)
      prices/route.ts           Yahoo Finance proxy
  components/
    ChatPopup.tsx               Floating chat (paste image, resizable)
  lib/
    supabase.ts                 DB client + TypeScript types
    claude.ts                   System prompt builder (main + onboarding)
    hooks.ts                    useUser, useAssets, useProfile, useSignOut
    profile-extractor.ts        Background profile extraction
    projection.ts               Milestone calculator
  middleware.ts                 Auth route protection
```

## Important Product Principles

1. **Conversation-first**. Everything happens through the chat assistant. No forms for adding assets.
2. **Investing tone, not trading**. Use "growth" not "P&L". Use "added" not "entry". No win/loss ratios. No gamification.
3. **Professional language**. No emojis. No exclamation marks. No "awesome / great / cool". Speak like a private banker.
4. **Asset-agnostic**. No country-specific features. No asset-type-specific logic. The intelligence is in the AI layer.
5. **Memory matters**. The investor profile builds itself over time. Every conversation makes the assistant smarter about the user.
6. **Backend is source of truth**. AI parses and explains. Deterministic code calculates and validates.
7. **Privacy over community**. No social features. No portfolio sharing. Like a private banker, not a forum.

## What Vesper Is NOT Trying to Be Yet

- Not a tax tool. No tax filing, no tax advice, no Box 3 calculator.
- Not a trading platform. No order execution, no broker integration.
- Not a budgeting app. No spending tracking, no transaction categorization, no bank feeds.
- Not a robo-advisor. No automatic rebalancing, no investment recommendations.
- Not a community. No social features, no portfolio sharing, no copy trading.
- Not country-specific. No NL-only features at launch (pension tracking, WOZ lookup, etc. — all out of scope).
- Not a mobile app. Web-first. iOS/Android come later if at all.
