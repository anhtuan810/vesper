# Volnar — Documentation

Code is the source of truth. These docs cover only what can't be read off the
code: how to release, why things are the way they are, and the product math.

## Orientation (start here in a new session)

Volnar is a personal portfolio tracker with a private-banker voice. Users track
net worth across stocks/ETFs, crypto, property (with mortgages), pensions,
cash, and bonds. The **chat is the only write path** — Claude parses intent,
deterministic code validates and computes every figure (the "AI parses, code
validates" rule; models never produce numbers, guardrails enforce it).

Stack: Next.js (App Router) on Vercel · Supabase (auth, Postgres + RLS,
storage) · Anthropic API (Sonnet for chat, Haiku for background generation) ·
Capacitor iOS app that ships the UI **inside the binary** (static export,
`scripts/build-native.mjs`) and talks to the same `/api` with Bearer auth;
self-managed OTA updates via `scripts/ota-release.mjs`.

Repo map: pages in `src/app`, API routes in `src/app/api`, domain logic in
`src/lib` (chat agent in `src/lib/chat`, scenario engine in `src/lib/scenario`,
vitals in `src/lib/vitals`, native shell glue in `src/lib/native`), components
in `src/components`.

## The docs

| File | What it is |
|------|------------|
| `RELEASING.md` | How changes reach users: web deploy, native OTA, App Store binaries. Read before any release. |
| `technical-decisions.md` | Supabase schema, API routes, and the calculation rules (net worth, currency, mutations, pensions). Also: the 2026-06 chat correctness audit & remediation, and the automated test/eval setup (per-commit suite + nightly model and demo behaviour evals). |
| `payments-setup.md` | Stripe + RevenueCat dashboard/env setup, sandbox testing, and the go-live checklist. |
| `vitals-metrics-reference.md` | Per-vital formulas, thresholds, guards; Perspective percentiles. |

Anything else (feature inventories, roadmaps, design specs, manual QA
checklists) lives in git history — removed 2026-06-12 to keep this folder
trustworthy rather than exhaustive.
