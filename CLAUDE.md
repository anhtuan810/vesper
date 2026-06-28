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
- **Migrations are applied by hand (no CI auto-apply).** Code that depends on a new
  table degrades gracefully until the SQL is run, so it's safe to deploy first; the
  feature only fully works once the migration is applied. Live ones to remember:
  `market_swings` (Diary market-swing persistence — apply in production) and
  `demo_visitor_trial` (per-browser demo trial — apply wherever `DEMO_ENABLED=true`).
  See `docs/technical-decisions.md` → Supabase Tables for the schema of each.
- **The maintainer is non-technical and does not write or run code.** Claude makes
  all code changes, runs all commands (git, build, tests), and explains decisions
  in plain language rather than handing over steps to run.
