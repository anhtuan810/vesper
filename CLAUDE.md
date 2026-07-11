@AGENTS.md

## Working agreement (since 2026-06-24)

- **Develop directly on `main`.** Commit straight to `main` and push after each
  change — no pull requests, no long-lived feature branches.
- **`main` is production** (the website, and the API the iOS app calls). Keep it
  deployable at all times.
- **The per-visitor demo ships dormant.** It is gated behind `DEMO_ENABLED`, which
  stays unset/false in production. While it's off, the demo entry points
  (`/demo`, `/api/demo-session`) fall back to the existing shared-account demo, so
  the released App Store build's demo button keeps working. When it's on, each
  visitor session is capped at 20 chat messages (`DEMO_CHAT_DAILY_LIMIT` — the
  session lives at most an hour, so the daily bucket is a session-lifetime cap)
  and minting is capped at 3 sessions per IP per hour (`demo_ip_limits`
  migration; the guard fails open until it's applied).
- **Do NOT set `DEMO_ENABLED=true` in production until a matching App Store binary
  is live.** The per-visitor demo's wall/expiry UI ships inside the binary, so
  enabling it server-side first would wall users with no UI to catch them. Test it
  on a Vercel **Preview** (with `DEMO_ENABLED=true` scoped to Preview) instead.
  Enabling it also requires the `demo_users` + `demo_visitors` migrations applied
  to that environment's database (and `demo_ip_limits` for the minting cap).
- **The per-entry "why the market moved" story feature is REMOVED (Jul 2026).**
  The code (`src/lib/market-story-cache.ts`, its diary-route hooks, and the
  `MARKET_STORIES_ENABLED` flag) was deleted in the Anthropic cost-reduction pass —
  it had already been switched off after an uncached-regeneration cost incident.
  Auto market entries show the movement + portfolio impact, without a "why" clause.
  The `market_stories` table may still exist in Supabase; no code reads or writes
  it, and it is safe to drop by hand whenever. Bringing the feature back means
  reverting the removal commit, not flipping a flag.
- **Migrations are applied by hand (no CI auto-apply).** Code that depends on a new
  table degrades gracefully until the SQL is run, so it's safe to deploy first; the
  feature only fully works once the migration is applied. Live ones to remember:
  `market_swings` (Diary market-swing persistence — apply in production),
  `decision_verdicts` (Decision Verdict cache — apply in production; until then every
  verdict is computed live, which is just slower), `demo_visitor_trial` (per-browser
  demo trial — apply wherever `DEMO_ENABLED=true`), `demo_ip_limits` (per-IP cap on
  demo-session minting — apply wherever `DEMO_ENABLED=true`; until then the demo
  works but minting is unthrottled), `price_history` (global per-symbol
  daily-close cache — apply in production; until then the first-add graph/journal rebuild
  re-fetches each symbol's full history from Yahoo every time, which is just slower),
  `fx_rate_history` (global per-date FX-rate cache — apply in production; until then the
  same rebuild re-fetches the multi-year Frankfurter series every time, which is just slower).
  (`market_stories` belonged to the removed story feature — do not apply it; if the
  table already exists it is orphaned and safe to drop, see the bullet above.)
  `users_onboarding_completed_at` (adds the `users.onboarding_completed_at` flag that
  drives the gated onboarding — apply in production. Until it is applied the middleware
  gate FAILS OPEN: the column read errors, is treated as "complete", and NO ONE is
  walled — so it's safe to deploy first. The migration also backfills every existing
  user to complete, so applying it only ever gates genuinely-new signups; it never
  sends an existing user into onboarding.)
  See `docs/technical-decisions.md` → Supabase Tables for the schema of each.
- **Live-API testing is OWNER-GATED (2026-07-11, cost).** The live model eval
  (`scripts/eval-agent-chat.ts` + `chat-eval.yml`, scenario cases against the
  real `CHAT_MODEL`; needs the `ANTHROPIC_API_KEY` repo secret) exists but runs
  ONLY when the owner explicitly asks for a run — manual `workflow_dispatch`,
  no schedule, never in per-commit CI, never run casually while iterating.
  The demo read eval (`eval-chat-demo.ts`/`demo-eval.yml`, which spent the
  production server's key through the deployed app) stays REMOVED; anything
  similar needs the owner's explicit go-ahead first. All routine verification
  is hermetic and free: `npm test` (scripts/verify-*.ts), `npm run typecheck`,
  `eslint`, `next build`.
- **The maintainer is non-technical and does not write or run code.** Claude makes
  all code changes, runs all commands (git, build, tests), and explains decisions
  in plain language rather than handing over steps to run.
