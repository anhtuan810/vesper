# Testing Strategy

Status: activated at the starter layer. Volnar now has a small Node test harness covering the first pure calculation/validation seams; the broader plan below remains the roadmap for expanding confidence before public launch.

## What this document is

A snapshot of the thinking on automated testing for Volnar, recorded so it doesn't have to be re-derived later. When a real regression hurts a user, or paying users come on, or refactor velocity slows because of fear of silent breakage — that's the trigger to revisit this doc.

## Two distinct questions

1. **Is the code doing what I told it to do?** → unit + integration tests on math and data transformation.
2. **Is the product doing the right thing for users?** → manual walkthroughs and (later) LLM-as-user automation.

These are independent. Both have a place. Neither is a substitute for the other.

## Layered approach when ready

### Layer 0: Math layer unit tests (highest leverage, lowest cost)
Pure-function tests for the calculation layer. No mocks, no I/O.

Files to test:
- `src/lib/money.ts` — `formatMoney`, `formatMoneyParts`, `convertToEur`, `getRateFreshness`, `getEurRate`, sign handling, locale formatting
- `src/lib/projection.ts` — `getMilestoneProgress` across EUR/USD/GBP and various portfolio sizes; `fmtRemaining`
- `src/lib/mortgage.ts` — annuity, linear, interest-only against known amortization values
- `src/lib/validations.ts` — negative-units rejection, negative-value rejection, float tolerance on fractional crypto
- `src/lib/snapshot.ts` — snapshot calculation: net worth uses equity, breakdown uses gross
- `src/lib/country-currency.ts` — country mapping, fallback to EUR

Tooling: Node's built-in test runner is currently used to avoid adding another dependency in the locked environment. Vitest remains a good later upgrade if richer fixtures/mocking become necessary.
Effort: half a day to expand the current starter tests to ~50 tests.
Maintenance: low. Pure functions don't drift.

### Layer 1: Playwright smoke tests (catastrophic regression floor)
Five or six flows that exercise the deterministic skeleton. Nothing AI-related.

Suggested flows:
- New user signup → empty dashboard renders → BottomNav visible
- Signed-in user → /diary → entries render
- Signed-in user → /profile → switch to USD → reload → still USD
- Signed-in user → asset detail → renders read-only
- Signed-in user → click DISCUSS on asset → chat opens with context

Effort: half a day.
Maintenance: low if scoped to skeleton; high if it tries to assert on AI output.
What it catches: routing breakage, broken auth, components that fail to render.
What it misses: AI quality, latency feel, copy tone, anything subjective.

### Layer 2: Integration tests for `apply-changes.ts` (highest-stakes file)
Fixture-based tests that feed `<changes>` JSON in and assert on the intended DB writes. The actual Supabase write stays separate; the test runs against the pure transformation.

Why this file specifically: it's where AI output meets database writes. The Phase D edit-path bug (real-estate value edits via chat stored as if EUR) is exactly the kind of regression a fixture test would catch — feed a `<changes>` JSON for a real-estate edit on a GBP-native asset, assert that `updateData.value` is the EUR-converted value.

Coverage target: action × asset-type × currency matrix. ~10–15 fixtures.

Effort: one day, mostly extracting the pure transformation logic from the I/O.
Maintenance: medium. Updates needed when the schema changes or new actions are added.

### Layer 3: LLM-as-user conversational walkthroughs (post-paying-users)
A second LLM driven against the app via browser automation. Given a persona and a goal, it converses with Volnar's assistant. A third LLM grades the transcript.

Tooling options:
- Anthropic Computer Use API — Claude takes screenshots and outputs mouse/keyboard actions
- Browser Use (Playwright + LLM) — open source, more control
- Claude for Chrome extension — less hands-on, more manual

Personas worth automating eventually:
- New user with mixed portfolio (8 positions across stocks/crypto/real estate/cash)
- User with non-EUR property (London flat, USD trader)
- User who pastes a broker screenshot first thing
- User who tries off-topic requests (tax help, "should I sell")
- User who switches display currency mid-session
- Returning user after sign-out (chat history reload)

Grader criteria per run:
- Did the goal complete?
- How many turns?
- Did the assistant ever ask for info the user already gave?
- Did the user express confusion or frustration?
- Did final DB state match stated intent?

Effort: 2–4 days for first persona. Flaky for first 2 weeks.
Maintenance: high. Prompts evolve, UI evolves, graders need tuning.
What it catches: conversational regressions, prompt drift, AI quality drops.
What it misses: subjective feel, tone, design judgment.

## What to skip
- React component unit tests. High cost, low signal for this codebase.
- API route integration tests against a test database. Fixture-based pure tests on `apply-changes.ts` cover the same ground at a fraction of the cost.
- E2E coverage above ~5 flows. Diminishing returns; high maintenance.
- Snapshot tests on UI. Brittle, low signal.

## Ordering when activated
1. Math layer unit tests (Layer 0). Half a day. Always worth it.
2. `apply-changes.ts` fixtures (Layer 2). One day. Highest-stakes file.
3. Playwright smoke (Layer 1). Half a day. Catastrophic regression floor.
4. LLM-as-user (Layer 3). Multi-day. Post-paying-users.

The sequence matters: 0 and 2 protect the data layer; 1 protects the rails; 3 protects the experience. Build out from the inside.

## Triggers to revisit this document
- A silent regression reaches a user
- First paying user signs up
- Refactor work feels risky in a way it didn't before
- A bug post-mortem reveals "tests would have caught this"

Until one of those, the manual demo script (`docs/demo-script.md`, when written) plus careful acceptance criteria per phase is sufficient.

## Related: manual demo script
A separate, complementary tool. Not a test — a structured rehearsal of user journeys you run on yourself weekly on a fresh account. Catches discoverability and feel issues that automation misses. See `docs/demo-script.md` (to be written) when ready.
