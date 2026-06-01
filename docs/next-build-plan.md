# Next Build Plan

This is the prioritized roadmap for Volnar. MVP-focused. Avoid enterprise architecture. Each feature should be shippable in 1–3 days.

## What just shipped — Pilot-readiness batch

Implemented in one session against the audit results from `docs/`. All changes are in-place; no new schema tables.

- **Pilot analytics** — `@vercel/analytics` added. 4 events: `signup`, `first_asset_added`, `first_chat_mutation`, `return_visit_day2_plus`. Server-side events returned as `analyticsEvent` flag from `/api/chat`, fired client-side in `use-chat-session.ts`.
- **DB performance indices** — `supabase/migrations/20260520_perf_indices.sql` adds `messages(user_id, created_at DESC)` and `snapshots(user_id, date DESC)`. Apply via Supabase dashboard or `supabase db push`.
- **IntersectionObserver `rootMargin`** — added `rootMargin: "200px 0px 0px 0px"` to both chat surfaces (`chat/page.tsx`, `ChatPopup.tsx`). Messages preload before the sentinel is fully visible. The existing `hasScrolled.current` guard (which already prevents chain-loading on cold open) is untouched.
- **Insight thin-portfolio** — `generateInsight` returns deterministic copy for ≤3 assets, skipping the Haiku call. 1 asset: names the position + 2 absent categories. 2–3 assets: names anchors + common gaps.
- **Onboarding next-step nudge** — `buildDynamicContext` injects a one-sentence ONBOARDING NEXT-STEP block when the portfolio has 1–5 assets all in one category, asking Claude to mention complementary asset types at the end of a winding-down turn. Disappears once the user diversifies.
- **Tone variation** — replaced rigid `"Say 'added' not 'done'"` constraint in `buildStaticSystem` with a variety instruction. Adds first-name guidance (occasional, not every turn).
- **Net worth chart** — removed Catmull-Rom spline smoothing; chart now uses straight `L` line segments between snapshot points.
- **Onboarding seed copy** — stocks seed message updated to read "Tell me what you own — type it, paste a screenshot, or pick a category below."

---

## What just shipped — Decision 12: Chips first, typing as fallback (PR 22)

Four PRs shipped together as the Decision 12 implementation:

- **PR 22a — `claude.ts`: require chips on every assistant turn.** Both `buildStaticSystem` and `buildOnboardingPrompt` now include a `CHIPS` block requiring Claude to emit a `<suggested_replies>` JSON array on every response (3–4 strings). `route.ts` parses the tag, saves `suggested_replies` to the `messages` table, and returns it in the API response. The full chip catalogue (onboarding steps, asset add/confirm, performance Q&A, insight follow-ups, diversification) is in `claude.ts`.
- **PR 22b — `chat-seeds.ts`: static seed system.** New `src/lib/chat-seeds.ts` exports `getChatSeed(source, key, message?)` returning a `{message, chips}` pair for three seed sources: `onboarding-class` (6 asset-class slugs with hardcoded copy), `asset` (fixed 3-chip Q&A set, message built from asset name), `insight` (fixed 3-chip follow-up set, message passed in from InsightBand via sessionStorage). Both `chat/page.tsx` and `ChatPopup.tsx` read `?seed=<source>&key=<key>` on mount, resolve the seed, and render it as a synthetic assistant message with chips. The seed is local-only — never persisted. It disappears when the user sends their first message.
- **PR 22c — Entry points: empty state, asset detail, insight band.** Portfolio empty state in `page.tsx` replaces the single "Tell me what you own" button with a 6-row serif italic asset-class picker (Stocks & ETFs / Real estate / Crypto / Cash & savings / Pension & retirement / Other) plus a subordinated 7th row for free-text entry. Each row routes to `/chat?seed=onboarding-class&key=<slug>`. `BottomNav.tsx` routes the Chat tab from asset detail to `/chat?seed=asset&key=<id>` (was `?asset=<id>`). `InsightBand.tsx` writes the insight sentence to `sessionStorage` then routes to `/chat?seed=insight&key=current`.
- **PR 22d — Placeholder copy.** When a seed is showing OR the last assistant message carries chips, both chat surfaces show "Or type something else…" as the input placeholder instead of the default. Pure derived boolean, no new state.

---

## What just shipped — Redesign migration (PR 1 → PR 21)

A multi-chat migration moved Volnar from the old amber/Fraunces dark-only design to the locked redesign — cream/ink in light mode, warm-black/cream in dark, single accent green (`#4A7C5E`), Source Serif 4 + Albert Sans typography. Beyond the visual swap, the migration enforced the 11 locked decisions in `redesign-decisions.md` and absorbed all manual edit paths into chat.

### Foundations
- **PR 1 — Theme infrastructure.** `users.theme` column (auto/light/dark), `ThemeProvider`, cookie-based SSR, `PATCH /api/users/me` with field allowlist `{ theme, display_currency, avatar_url }`. Light + dark CSS variable sets in `globals.css`.
- **PR 2 — Design tokens + font swap.** Cream/ink palette, green accent, Source Serif 4 + Albert Sans + Geist Mono (sparingly). All tokens flow through CSS variables and Tailwind utilities; TypeScript mirror in `src/lib/tokens.ts`.
- **PR 3 — Settings → Profile (Decision 5).** `/settings` route deleted; preferences (currency + theme) live on Profile.

### Behavioural decisions
- **PR 4 — Asset detail read-only (Decision 8).** Deleted `PATCH /api/assets/[id]`, `DELETE /api/assets/[id]`, `InlineEdit.tsx`, `DeleteAssetButton.tsx`, `ContextNotePrompt.tsx`. All three asset detail variants render read-only. Chat tab on bottom nav becomes context-aware when over `/asset/[id]`.
- **PR 5 — Diary immutability + JOIN (Decisions 1, 2, 4).** Deleted `PATCH /api/mutations/[id]`. Pure renames update the asset row but skip the mutation insert. Diary fetch joins to `assets.name` with `mutations.asset_name` as deleted-asset fallback. Same JOIN in `/api/diary-summary` and the search predicate.
- **PR 6 — Chat single thread (Decision 3).** Removed all "new chat" / "history" / "session list" affordances. Added cursor pagination to `GET /api/messages` (`before=<id>&limit=20`). IntersectionObserver sentinel in both chat surfaces.
- **PR 7 — Avatar upload + fingerprint (Decisions 6, 7).** `user-avatars` Supabase Storage bucket. Tap-to-upload on Profile. `users.fingerprint` text column. Extractor extended to emit a 12–18 word italic-serif characterization.
- **PR 8 — Mortgage auto-amortization + map-only + cash pots (Decisions 9, 10, 11).** `assets.mortgage_balance_recorded_at` anchor column. `computeCurrentBalance(asset, asOf)` helper in `src/lib/mortgage.ts`. All read sites route through the helper. PropertyMap is sole real-estate visual; photo upload removed. Cash/pension → wallet SVG icon; bonds → certificate SVG icon.

### Visual parity
- **PR 9 — Portfolio restyle.** NetWorthHero, NetWorthChart, PositionRow, badges, HR rules — all matched to the locked mockup.
- **PR 10 — Diary restyle.** Search bar, period chips, entry rows, "Worth knowing" callout, immutable static notes.
- **PR 11 — Chat restyle + desktop context-aware seed.** ChatPopup pre-fills `Tell me about my <name>.` when opened over an asset detail page.
- **PR 12 — Profile + Asset Detail restyle.** Caught a missed cleanup from PR 8: PropertyMap photo-upload affordance removed.
- **PR 13 — Post-migration polish.** Light map style added (`src/styles/map-light.json`); theme-aware MapLibre. NavBar overlap fix. Activity rows, change pill, position rows, chat HR refinements.
- **PR 14 — Holdings grouping.** Semantic categories: Property / Public markets / Reserves. `HoldingsGroup.tsx` with proportional bars in headers, rotating chevrons, all expanded by default.
- **PR 15 — Mockup parity round 2.** NavBar identity (avatar + first name, no Volnar wordmark). `AllocationBar.tsx` deleted (proportional bars in HoldingsGroup carry the same information). No gross/debt subtitle on hero.
- **PR 16 — AI insight band + tab icons + EU formatting + Recent Activity removed.** `/api/insight` route with Haiku generator, 24h cache via `highlights` table, italic-serif "WORTH KNOWING" band. Bottom-nav icons extracted from mockup. Number formatting forced to `nl-NL` locale across all currencies.
- **PR 17 — Mockup parity sweep.** Diary/Chat/Profile/Asset Detail small-drift fixes — anniversary band "Worth knowing" rewording, chat user-message line-height, equity pill `+€X since YEAR`, mortgage chart spacing.
- **PR 18 — Profile context read-only.** `InlineEdit.tsx` deleted entirely. Context fields render as static rows; corrections happen through chat → next extraction refresh.
- **PR 19 — Profile context fields reduced 9 → 6.** Removed `goal`, `risk_behaviour`, `interests` per the mockup. Labels in sentence case (`Investment style`, not `Investment Style`).
- **PR 20 — Avatar / icon size audit.** Confirmed code matched mockup values verbatim. No changes.
- **PR 21 — Deliberate downsize from mockup.** NavBar avatar 34→28px; BottomNav icons 26→24px, stroke-width 14→10. The mockup's flat-color "AT" badge reads lighter than a real uploaded image; the stroke-14 icons read chunkier in actual use than in static preview. Documented in code as an intentional deviation.

## Build Order

1. **Scenario analysis UI** (largest remaining feature on the original roadmap)
2. **Portfolio insight cards** (replacement for the removed stat cards — when there's enough portfolio history per user)

---

## 1. Scenario Analysis UI

### Goal
Let users explore "what if" questions visually, not just conversationally. Examples: "what if I sell my apartment", "what if NVIDIA doubles", "what if I add €50k to ETFs".

### Expected UI
- A "Scenarios" entry point on the Portfolio surface
- User can clone the current portfolio and modify it: change values, remove positions, add hypothetical ones
- Side-by-side comparison: Current vs Scenario (net worth, allocation, concentration)
- "Save scenario" to persist
- "Discuss with assistant" to send the scenario into chat for a written analysis

### Database Impact
- New `scenarios` table: `id`, `user_id`, `name`, `assets_snapshot` (jsonb), `created_at`
- No changes to existing tables

### Files Likely to Change
- `src/app/scenarios/page.tsx` (new) — scenarios list view
- `src/components/ScenarioBuilder.tsx` (new)
- `src/app/api/scenarios/route.ts` (new) — CRUD endpoints
- `src/lib/claude.ts` — extend the system prompt to handle scenario context
- New SQL migration for `scenarios` table

### Notes
- The chat assistant already handles scenarios conversationally — this UI complements, not replaces it
- Don't over-design. Two columns (current + scenario), a few editable fields, one comparison panel
- Honour the "chat is sole modification surface" principle: scenario clone-and-modify is local UI state, not a write path. Saving a scenario writes a snapshot row, not asset rows.

---

## 2. Portfolio insight cards (replacement for removed stat cards)

The four stat cards (Positions / Countries / Asset classes / Largest) were removed because raw counts don't drive decisions. The space they occupied should eventually carry one or two genuine portfolio insights — the kind a private banker would surface during a quarterly review. The AI insight band shipped in PR 16 covers one slot of this idea; deterministic insight cards would complement it.

### Candidates worth considering
- Concentration depth ("your top 3 positions are 84% of the portfolio")
- Drift from target allocation (when target allocations exist)
- Risk-adjusted return signal (Sharpe-like, but readable)
- Time-weighted vs money-weighted return divergence
- Cash drag estimate (when cash > 20% and has been for >3 months)
- Currency exposure (when display currency ≠ asset native currencies)
- Mortgage payoff trajectory vs portfolio growth (real estate users)

### Bar to clear
Each insight must change a decision. "You have 7 positions" does not. "Your top position has been over 40% for 8 weeks running" does.

Build when there's enough portfolio history per user (3+ months of snapshots) and enough users to test which insights actually land.

---

## Out of Scope for Now

- Group-by-year header in diary — premature
- Expanded mutation view showing the full conversation that produced it — requires linking mutations to message ranges, data plumbing not in place
- Weekly insight email — wait until users actually retain
- Allocation benchmarking — nice-to-have, not core
- Shareable portfolio report — growth feature, not retention
- Mobile native app — web-first
- Tax features — never, not Volnar's lane
- Broker sync / bank integrations — never for MVP; manual + AI-driven is the differentiator
- Dashboard highlights cards (market events, milestones, reflections) as originally specified — partially superseded by the AI insight band shipped in PR 16. Revisit if user research shows the single-sentence band isn't enough.

---

## Tech Debts

- The `before_value` / `after_value` columns on `mutations` are EUR-equivalents but `currency` is native — pre-existing semantic muddle, separate task to design properly
- No type validation on chat input body — fine for MVP, revisit if API ever goes public
- Two-write atomicity (asset update + mutation insert) is not transactional — if this becomes a real reliability issue, move both writes into a Postgres function via Supabase RPC
- Hardcoded FX fallback rates drift over time — review annually if the cache and frankfurter.app both fail
- No tests — accepted for MVP. See `testing-strategies.md` for the activation plan.
- ~~No analytics~~ — shipped: `@vercel/analytics` with 4 pilot events.
- ~~Compound index on `messages (user_id, created_at DESC)`~~ — shipped in `20260520_perf_indices.sql` (also adds `snapshots` index).
- Chat history mapper silently coerces unknown `role` values to `"assistant"`. Acceptable given the schema only ever writes `"user"` or `"assistant"`, but a `continue` in the mapper would be more defensive against future schema drift.
- AAPL logo intermittently 404s from FMP — falls back to monogram. Display-only.
- Safari OAuth on localhost — Google sign-in on localhost via Safari redirects to production due to Safari + ITP third-party cookie blocking. Works in Chrome and other browsers; production unaffected.
- `users.fingerprint` extraction reliability — for any active user where `users.fingerprint` stays null, check Sentry for failed extraction calls. The Profile slot hides cleanly when null, so this is not user-visible — but it should populate within one or two conversations.

---

## Known performance issues

Two performance concerns surfaced in user testing. Both have since been
addressed; remaining items are marginal. Re-measure in production before
any further work.

### Portfolio page slow load (production)

Symptom: cold load of `/` is slow in production. Noticeable wait
before the page is interactive.

**Status: largely addressed.**
- ✅ `/api/dashboard-init` batched endpoint — already shipped, parallel-fetches all data in one auth round-trip
- ✅ Assets stale-while-revalidate (sessionStorage) — already shipped
- ✅ `snapshots(user_id, date DESC)` DB index — added in `20260520_perf_indices.sql`
- ✅ Thin-portfolio insight path — skips Haiku for ≤3 assets, eliminating the cold-insight latency for new users
- ⬜ Server Component for the static shell — `src/app/page.tsx` is still a Client Component (`"use client"`). Moving layout + hero + holdings skeleton to a Server Component would get meaningful HTML before JS hydrates. Now low-priority given progressive render and sessionStorage SWR already shipped.
- ⬜ Lazy per-category sparklines and day-change pills — currently load synchronously with `dashboard-init` data. Should wait until a group is expanded. Now low-priority given progressive render and sessionStorage SWR already shipped.
- ✅ Lazy per-range chart data — implemented; only the 1M range loads with the page via `dashboard-init`, other ranges fetch on tap.

Remaining root causes worth investigating:
- Yahoo Finance latency is variable; 5-min cache means first hit after expiry is full-cost.
- `/api/insight` Haiku call for larger portfolios (~1–2s) still hits on cache miss.

Next step: run a network waterfall in production to confirm which of the remaining items is the bottleneck before further investment.

### Chat history slow open

Symptom: reopening the chat surface with a long conversation
history takes noticeably long.

**Status: fixed.**
- ✅ `hasScrolled.current` guard — was already in place; `loadMore()` only fires after the user has scrolled, blocking chain-loading on cold open.
- ✅ `rootMargin: "200px 0px 0px 0px"` — added to both chat surfaces. Messages preload before the sentinel is fully visible, eliminating the "snap to load" UX.
- ✅ `messages(user_id, created_at DESC)` index — added in `20260520_perf_indices.sql`.
- ⬜ localStorage TTL bump (24h → 7d) — still worth doing for daily-or-less-frequent users. Low risk, no schema impact.

---

## Post-MVP / Future

### Adding a fourth currency

EUR/USD/GBP share the same milestone step pattern (1k/5k/10k/50k/100k/500k/1M/5M).
Adding a currency outside that pattern (JPY, SEK, INR, etc.) requires:

- Extend `SUPPORTED_CURRENCIES` in `src/lib/money.ts` with the new ISO code, symbol, and locale.
- Extend `getMilestoneProgress` in `src/lib/projection.ts` with currency-specific step magnitudes
  (e.g. JPY: 100k/500k/1M/5M/10M/50M/100M).
- Extend `COUNTRY_TO_CURRENCY` in `src/lib/country-currency.ts` with relevant country codes.
- Verify `/api/fx` serves the new pair (frankfurter.app supports most majors).
- Add a hardcoded fallback rate in `money.ts` for the offline path.
- Update few-shot examples in `src/lib/claude.ts` if the currency is common enough to warrant one.
- Consider whether the forced `nl-NL` formatting (PR 16) still reads right for the new currency, or whether the new currency warrants its own locale override.

The architecture supports this without a refactor.

### Auto-WOZ valuation for Dutch properties

Currently the property `value` is whatever was last stated via chat. A periodic WOZ lookup for NL properties (annual cadence aligned with WOZ updates) would write a fresh value automatically and log a single mutation per year per property. Equivalent for other countries via market-data APIs is a much larger project; WOZ is the cheap, well-defined first step.

### Test activation

See `testing-strategies.md` for the layered plan (math-layer unit tests → `apply-changes.ts` fixtures → Playwright smoke → LLM-as-user). Triggers: first paying user, first silent regression reaching a user, refactor velocity slowing.
