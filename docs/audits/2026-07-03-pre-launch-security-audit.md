# Pre-launch security audit

**Date:** 2026-07-03
**Scope:** Whole application (Next.js app + API routes, Supabase/RLS, Stripe &
RevenueCat billing, AI chat, cron, native/iOS, secrets). Prompted by going live
for real users. Read-only review followed by a hardening pass — the code fixes
below are implemented and merged to `main`; the configuration items are actions
for the operator (Vercel / Supabase / Xcode).

## Verdict

The app was built with real security awareness. The highest-impact classes were
already handled correctly:

- **No broken access control / IDOR.** Every API route authenticates (`getAuthUser`)
  and scopes each query to the authenticated `user.id`; no route trusts a client
  supplied user id. The AI chat tools take the user id from the session, so a
  prompt-injected tool call cannot reach another user.
- **Billing can't be forged.** Stripe verifies the webhook signature on the raw
  body; RevenueCat checks a shared secret; both are idempotent and re-read state
  from source. Entitlements are service-role-write-only (RLS owner-read).
- **Secrets are clean.** None committed to the repo or git history; server-only
  keys (service role, Stripe, Anthropic, webhook secrets, `CRON_SECRET`) are never
  `NEXT_PUBLIC` and never referenced in client code.
- **RLS is correctly configured** (verified against production — see below).
- **No SQL injection, XSS, or SSRF.** DB access is parameterized; the three
  `dangerouslySetInnerHTML` sinks are escaped or fed static content; all outbound
  fetches hit fixed hosts with `encodeURIComponent`-ed inputs.
- **Account deletion is GDPR-thorough** (purges storage, all tables, Stripe/
  RevenueCat customers, and the auth user, all derived from the session).

The single largest *residual* risk was a configuration one — the core tables'
RLS lives outside version control and this codebase had shipped RLS-disabled
tables once before (`20260615_security_advisor_hardening.sql`). It was verified
directly against production and is correct.

## RLS — verified against production (2026-07-03)

`pg_class.relrowsecurity = true` on every table. `pg_policies` confirmed
owner-scoped policies on the client-reachable tables:

| Table | Policy | Verdict |
|---|---|---|
| `assets`, `mutations`, `snapshots`, `messages`, `highlights`, `goals` | `ALL` USING `auth.uid() = user_id` | ✅ owner-only (read + write) |
| `users` | `ALL` USING `auth.uid() = id` | ✅ owner-only |
| `scenarios` | `ALL` USING + WITH CHECK `= user_id` | ✅ owner-only |
| `entitlements` | `SELECT` owner-only; writes via service role | ✅ correct |
| server-only caches (`fx_rates`, `market_moves`, `market_swings`, `decision_verdicts`, `device_tokens`, `demo_users`, `demo_visitors`, `billing_events`, `diary_summaries`, `vital_snapshots`) | RLS on, no policies | ✅ service-role only |

Note: `with_check = NULL` on the `ALL` policies is safe — Postgres reuses the
`USING` expression to check inserts/updates when `WITH CHECK` is omitted.

`date_context` carries a `SELECT USING (true)` policy — harmless as long as the
table holds no per-user column (global reference data). Confirm it has no
`user_id` column.

## Storage — verified

`property-photos` bucket has per-owner policies for read/update/delete
(`bucket_id = 'property-photos' AND storage.foldername(name)[1] = auth.uid()`).
Outstanding: confirm the upload (`INSERT`) policy's `with_check` also pins to the
user's folder, and whether the bucket is `public` (low sensitivity — home map
thumbnails; consider private + signed URLs).

## Fixes implemented (merged to `main`)

Commit: *"Security hardening: rate-limit/cap abuse surfaces, fail-closed cron
auth, timing-safe secrets."* Typecheck clean; all 28 behaviour suites pass; no
behaviour change for legitimate use.

- **Prices amplification (was the top code risk):** `/api/prices` and
  `/api/prices/history/batch` now cap the client-supplied `symbols` array (100)
  and bound outbound concurrency (8) — one request can no longer fan out to
  thousands of Yahoo fetches (socket exhaustion / IP ban).
- **Geocode:** per-user daily cap; the Nominatim throttle now serializes
  concurrent calls (the old limiter let N callers burst past 1 req/s).
- **Insight `fresh=1`:** capped forced LLM regenerations per user/day, degrading
  to cached cards instead of a 429.
- **Chat / diary-summary:** capped screenshots-per-turn and the client-supplied
  activity list + free-text note length before they reach the LLM prompt.
- **Cron auth:** shared `assertCron()` fails **closed** when `CRON_SECRET` is
  unset (the old inline check compared against the literal `"Bearer undefined"`)
  and compares constant-time.
- **RevenueCat webhook** secret compared constant-time (`safeEqual`).
- **Defense-in-depth:** `apply-changes` asset UPDATE/DELETE also filter by
  `user_id` (service-role client bypasses RLS, so this matters); the AI agent's
  commit path downgrades a bare `removal_reason: "mistake"` (hard delete of asset
  + history) to `"sold"`; billing-portal returns a generic error (raw Stripe text
  stays in logs); added `Strict-Transport-Security` and `Permissions-Policy`
  response headers.

New helpers: `src/lib/{safe-compare,cron-auth,rate-limit,concurrency}.ts`.

Left intentionally un-coded: `/api/logo` (unauthenticated image proxy) DoS —
best fixed with an edge/WAF rate-limit rule, not an unreliable in-memory limiter.

## Remaining operator actions (not code)

Priority order:

1. **`REVENUECAT_ALLOW_SANDBOX` must be unset/`false` in Production.** If `true`,
   a free sandbox/TestFlight purchase grants a real paid entitlement.
2. **`DEMO_ENABLED` should be `false` in Production** until a matching App Store
   binary ships. While on, `/api/demo-session` and `/demo` mint unlimited seeded
   anonymous accounts (each with an active entitlement → free AI usage) with no
   rate limit → DB/quota bloat and Anthropic cost. If kept on, add a Vercel
   Firewall rate-limit rule on both paths (and a code-level creation cap).
3. **Vercel Firewall** rate-limit rules on `/api/logo` and the demo endpoints
   (~5 req/min per IP).
4. **iOS `aps-environment` → `production`** in the App Store build (it is
   `development` in the repo) or push notifications silently fail.
5. **Supabase:** enable email confirmation (closes a subscription self-heal edge
   case and blocks fake-email signups); confirm backups / point-in-time recovery
   are on for the (financial) data.
6. Commit the base schema + RLS/storage policies as a migration so they are
   version-controlled and a rebuild is reproducible.

## Lower-severity notes (for the backlog)

- Chat rate limit counts turns (50/day), not model calls; one turn can drive
  ~15–20 Anthropic calls. Consider a token/spend budget rather than a turn count.
- Self-heal subscription reconcile (`/api/subscription`) matches a Stripe customer
  by email without verifying the customer's stamped `supabase_user_id`; safe only
  while email confirmation is enabled (see action 5). Prefer reconciling by the
  stored `stripe_customer_id`.
- CSP allows `'unsafe-inline'` scripts (no nonce) — tightening is a larger change.
