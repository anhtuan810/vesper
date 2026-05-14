# Volnar

A personal portfolio intelligence web app. Gives investors clarity over their full financial picture through conversation, not forms.

## Stack

- **Next.js** (latest, Turbopack) with App Router
- **React** / TypeScript / Tailwind CSS
- **Supabase** (Postgres + Auth + Storage)
- **Anthropic Claude API** (`claude-sonnet-4-6` for the assistant; `claude-haiku-4-5-20251001` for summaries, profile extraction, and the insight band)
- **MapLibre GL JS** on OpenFreeMap tiles (property maps, no key required)

## Getting Started

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
CRON_SECRET
SENTRY_DSN          # optional
NEXT_PUBLIC_SENTRY_DSN  # optional
```

## Docs

See `docs/` for the full technical reference:

- `docs/volnar-project-handoff.md` — high-level product overview, structure, and principles
- `docs/technical-decisions.md` — stack, schema, API routes, patterns
- `docs/current-features.md` — what is built and working
- `docs/next-build-plan.md` — prioritized roadmap
- `docs/redesign-decisions.md` — the 11 locked product decisions
- `docs/currency-feature-spec.md` — display currency feature (all phases shipped)
- `docs/testing-strategies.md` — test activation plan (currently deferred)
