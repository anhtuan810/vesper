@AGENTS.md

## Working agreement (since 2026-06-24)

- **Develop directly on `main`.** Commit straight to `main` and push after each
  change — no pull requests, no long-lived feature branches.
- **`main` is production** (the website, and the API the iOS app calls). Keep it
  deployable at all times.
- **The per-visitor demo ships dormant.** It is gated behind `DEMO_ENABLED`, which
  stays unset/false in production. While it's off, the demo entry points
  (`/demo`, `/api/demo-session`) fall back to the existing shared-account demo, so
  the released App Store build's demo button keeps working.
- **Do NOT set `DEMO_ENABLED=true` in production until a matching App Store binary
  is live.** The per-visitor demo's wall/expiry UI ships inside the binary, so
  enabling it server-side first would wall users with no UI to catch them. Test it
  on a Vercel **Preview** (with `DEMO_ENABLED=true` scoped to Preview) instead.
  Enabling it also requires the `demo_users` + `demo_visitors` migrations applied
  to that environment's database.
- **The per-entry "why the market moved" story ships OFF.** It is gated behind
  `MARKET_STORIES_ENABLED`, which stays unset/false everywhere. The feature generates
  one search-grounded `claude-sonnet-4-6` sentence per auto market entry (via
  `web_search`), cached per `(date, symbol)` in `market_stories`. It was disabled
  after an uncached-regeneration cost incident (Jul 2026): before its migration
  existed the generator couldn't persist a result, so it re-ran on every diary view —
  an unbounded Sonnet + web-search bill. With the flag off, no story is generated or
  attached; auto market entries still show the movement + portfolio impact, just
  without the "why" clause. To turn it back on: set `MARKET_STORIES_ENABLED=true`
  **and** apply the `market_stories` migration (both are required), then watch the
  Anthropic cost dashboard.
- **Migrations are applied by hand (no CI auto-apply).** Code that depends on a new
  table degrades gracefully until the SQL is run, so it's safe to deploy first; the
  feature only fully works once the migration is applied. Live ones to remember:
  `market_swings` (Diary market-swing persistence — apply in production),
  `decision_verdicts` (Decision Verdict cache — apply in production; until then every
  verdict is computed live, which is just slower), `demo_visitor_trial` (per-browser
  demo trial — apply wherever `DEMO_ENABLED=true`), `price_history` (global per-symbol
  daily-close cache — apply in production; until then the first-add graph/journal rebuild
  re-fetches each symbol's full history from Yahoo every time, which is just slower),
  `fx_rate_history` (global per-date FX-rate cache — apply in production; until then the
  same rebuild re-fetches the multi-year Frankfurter series every time, which is just slower)
  and `market_stories` (global per-(date, symbol) "why the market moved" cache for auto
  market entries — the feature is currently OFF behind `MARKET_STORIES_ENABLED`, so do
  NOT apply this migration to re-enable it on its own; turning it on needs the flag
  **and** the migration, see the dedicated bullet above).
  `users_onboarding_completed_at` (adds the `users.onboarding_completed_at` flag that
  drives the gated onboarding — apply in production. Until it is applied the middleware
  gate FAILS OPEN: the column read errors, is treated as "complete", and NO ONE is
  walled — so it's safe to deploy first. The migration also backfills every existing
  user to complete, so applying it only ever gates genuinely-new signups; it never
  sends an existing user into onboarding.)
  See `docs/technical-decisions.md` → Supabase Tables for the schema of each.
- **The maintainer is non-technical and does not write or run code.** Claude makes
  all code changes, runs all commands (git, build, tests), and explains decisions
  in plain language rather than handing over steps to run.
