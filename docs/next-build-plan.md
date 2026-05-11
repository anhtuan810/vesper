# Next Build Plan

This is the prioritized roadmap for Vesper. MVP-focused. Avoid enterprise architecture. Each feature should be shippable in 1–3 days.

## What just shipped — Redesign migration (PR 1 → PR 21)

A multi-chat migration moved Vesper from the old amber/Fraunces dark-only design to the locked redesign — cream/ink in light mode, warm-black/cream in dark, single accent green (`#4A7C5E`), Source Serif 4 + Albert Sans typography. Beyond the visual swap, the migration enforced the 11 locked decisions in `redesign-decisions.md` and absorbed all manual edit paths into chat.

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
- **PR 15 — Mockup parity round 2.** NavBar identity (avatar + first name, no Vesper wordmark). `AllocationBar.tsx` deleted (proportional bars in HoldingsGroup carry the same information). 1D pill added to range selector. No gross/debt subtitle on hero.
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
- Tax features — never, not Vesper's lane
- Broker sync / bank integrations — never for MVP; manual + AI-driven is the differentiator
- Dashboard highlights cards (market events, milestones, reflections) as originally specified — partially superseded by the AI insight band shipped in PR 16. Revisit if user research shows the single-sentence band isn't enough.

---

## Tech Debts

- The `before_value` / `after_value` columns on `mutations` are EUR-equivalents but `currency` is native — pre-existing semantic muddle, separate task to design properly
- No type validation on chat input body — fine for MVP, revisit if API ever goes public
- Two-write atomicity (asset update + mutation insert) is not transactional — if this becomes a real reliability issue, move both writes into a Postgres function via Supabase RPC
- Hardcoded FX fallback rates drift over time — review annually if the cache and frankfurter.app both fail
- No tests — accepted for MVP. See `testing-strategies.md` for the activation plan.
- No analytics (PostHog/Mixpanel) — defer until user count justifies it
- Compound index on `messages (user_id, created_at DESC)` would optimize the cursor-paginated `/api/messages` fetch. Not blocking at current scale (hundreds of messages per user). File for a future migration when query latency becomes measurable.
- Chat history mapper silently coerces unknown `role` values to `"assistant"`. Acceptable given the schema only ever writes `"user"` or `"assistant"`, but a `continue` in the mapper would be more defensive against future schema drift.
- AAPL logo intermittently 404s from FMP — falls back to monogram. Display-only.
- Safari OAuth on localhost — Google sign-in on localhost via Safari redirects to production due to Safari + ITP third-party cookie blocking. Works in Chrome and other browsers; production unaffected.
- `users.fingerprint` extraction reliability — for any active user where `users.fingerprint` stays null, check Sentry for failed extraction calls. The Profile slot hides cleanly when null, so this is not user-visible — but it should populate within one or two conversations.

---

## Known performance issues

Two real performance concerns surfaced in user testing but not yet
investigated or fixed. Both have planned architectural approaches.
Both deserve a fresh chat with proper attention rather than
end-of-session triage.

### Portfolio page slow load (production)

Symptom: cold load of `/` is slow in production. Noticeable wait
before the page is interactive.

Hypothesized root causes, ranked:
- Page renders synchronously waiting for live prices instead of
  using stored EUR values from Supabase (`assets.value`) as the
  immediate render source.
- Fetches may be serialized in `useEffect` chains rather than
  truly parallel.
- `/api/insight` cache miss rate may be high, triggering a Haiku
  call on each page load (~1-2s).
- Missing DB index on `snapshots(user_id, date)`.
- Yahoo Finance latency is variable; 5-min cache means first hit
  after expiry is full-cost.

Planned architectural approach:

1. **Stale-while-revalidate for top-level values.** Hero total,
   group allocation bars, and holdings list render immediately
   using stored `assets.value` (already EUR, ≤5 min stale).
   Live-price refresh happens in the background; numbers update
   in place when the refresh returns. No skeleton, no blocking.
2. **Server Component for the static shell.** If `src/app/page.tsx`
   is fully client-rendered today, move the layout + hero +
   holdings skeleton to a Server Component. Initial HTML contains
   meaningful content before client JS hydrates. Live-price
   refresh stays client-side.
3. **Lazy per-category.** Sparklines, per-position day-change
   pills, and other group-expanded detail wait until the group is
   expanded. Top-level totals and allocation bars still render
   eagerly — they need the full picture.
4. **Lazy per-range.** Chart's 1M (default) loads with the page;
   1Y, All and other ranges fetch only when the user taps the
   range pill.
5. **DB indexes if missing.** Add `snapshots(user_id, date)`,
   verify `assets(user_id)`.

Eager (load with page): stored asset values, group bars, hero,
range=1M chart, cached insight band.

Lazy (load on interaction): live price refresh (background,
post-paint), per-position sparklines, day-change pills, chart
ranges beyond 1M.

Next step: run a diagnostic in a fresh chat covering network
waterfall, `/api/prices` behavior, `/api/insight` cache hit rate,
page component type, DB indexes, render path. Apply fixes
matching actual findings.

### Chat history slow open

Symptom: reopening the chat surface with a long conversation
history takes noticeably long. Feels like "loads the whole list"
even though the architecture is supposed to be paginated (20-msg
cursor pages).

Hypothesized root causes, ranked:
- **IntersectionObserver chain-load bug (most likely).** The
  sentinel for paginated scroll-back sits at the top of the
  message list. On cold open with only 20 messages, the sentinel
  is visible from page load and fires `loadMore()` automatically.
  Repeats until full history is fetched. Looks like one long load.
- Missing compound index on `messages(user_id, created_at DESC)`
  (already in generic Tech Debts above).
- localStorage cache 24h TTL — daily-or-less-frequent users
  always pay cold-load cost.

Planned fixes:
1. Gate the IntersectionObserver with a "user has scrolled" flag.
   Set true on first non-zero scroll event in the message
   container; only allow `loadMore()` when true. Alternative:
   attach the observer after first user interaction.
2. Add the compound index on `messages(user_id, created_at DESC)`.
3. Bump localStorage cache TTL from 24h to 7 days.

Next step: diagnostic in a fresh chat to confirm which cause
applies. The IntersectionObserver fix is cheap and worth doing
regardless of the others.

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
