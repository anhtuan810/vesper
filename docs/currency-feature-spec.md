# Display Currency Parameterization — Feature Spec

This document is the source of truth for the display currency feature. Read it in full before starting any phase. It defines the architectural principle, the supported currencies, the phased rollout, and the constraints.

Mirrors the pattern set by `redesign-brief.md` — one document, multiple phases, each phase a separate chat.

## Working principles (read first)

- **EUR is the storage unit.** Every numeric column in `assets`, `snapshots`, `mutations`, `goals` stores EUR-equivalent values. This is non-negotiable for this feature.
- **EUR is the FX pivot.** frankfurter.app is ECB-backed and EUR-anchored. Every rate is `EUR → X`. Storage in EUR means one hop at write (`native → EUR`) and one hop at render (`EUR → display`).
- **Display currency is per-user.** Stored on `users.display_currency`. One of `EUR`, `USD`, `GBP`. Default `EUR`.
- **Real estate has a native currency per asset.** Stored on `assets.currency`. Drives net-worth math the same way tradeable assets do — convert native to EUR for math, then EUR to display at render.
- **AI parses and explains. Deterministic code calculates and validates.** FX math never goes through Claude.
- **Math stays EUR.** Allocation percentages, concentration thresholds, snapshot totals, mutation values, goal targets — all EUR. Only the rendered string changes.
- **Milestones scale to display currency.** A USD user sees `$1k / $5k / $10k / ...` steps. A GBP user sees `£1k / £5k / £10k / ...`. EUR/USD/GBP are close enough to use the same step pattern with currency-specific rounding.
- **No retroactive rewriting.** Existing chat messages and diary entries render in whatever currency they were written in. Switching display currency takes effect on the next message and the next render.
- **Be direct in the UI.** No hedging copy, no apology toasts. One line of explanation when the user first switches: "Display only — your portfolio is unchanged."

## Style

- Professional language. No emojis. No exclamation marks.
- Code in TypeScript, React (App Router), Tailwind.
- Match existing patterns in the codebase before introducing new ones.

## Stack assumptions

Per `technical-decisions.md`. No new dependencies needed for this feature.

---

# Architecture

## Storage and math

| Layer | Currency |
|---|---|
| `assets.value` (tradeables) | EUR-equivalent. Server converts native → EUR in `/api/prices`. |
| `assets.value` (real estate) | EUR-equivalent. The asset's native currency is stored on `assets.currency`; the value column holds the EUR conversion at write time. |
| `assets.value` (cash, pension, bonds, other) | EUR-equivalent. Static-input flows convert at write. |
| `assets.currency` | Native currency (Yahoo's reported currency for tradeables; user-selected by location for real estate; user-selected for cash/pension/bonds/other). |
| `snapshots.total_value`, `snapshots.breakdown` | EUR. |
| `mutations.before_value`, `mutations.after_value`, `mutations.portfolio_total` | EUR. |
| `goals.target_value` | EUR. |
| `fx_rates` | EUR-base. Stays. |
| `users.display_currency` | ISO code: `EUR`, `USD`, or `GBP`. New column. |

## Display

Every component that renders money calls `formatMoney(eurValue, displayCurrency)`. The function:

1. Looks up the EUR → displayCurrency rate from the FX cache.
2. Converts the EUR value.
3. Formats with the display currency's symbol and locale conventions (`€1,234`, `$1,234`, `£1,234`).

When the user has not changed their preference, `displayCurrency = EUR` and the conversion is a no-op (rate of 1).

## Inputs

Manual input flows accept numbers in the user's display currency and convert at write:

```
displayValue × (1 / fxRate(EUR, displayCurrency)) → EUR-equivalent → store in assets.value
```

For real estate, an additional native-currency tag is captured at write:

```
user types value in displayCurrency → convert to EUR for storage in assets.value
                                     → store property's native currency on assets.currency (for transparency / future use)
```

Note: the EUR-stored value is the source of truth. The native-currency tag is metadata. There is no double-conversion at render — render always goes `assets.value (EUR) → displayCurrency`.

## Claude prompt

The system prompt is parameterized with `displayCurrency`. Claude is told:

- Render prose totals, allocations, and value changes in `{displayCurrency}`.
- The `<changes>` JSON spec stays native (Yahoo's reported currency for tradeables, user-stated currency for non-tradeables).
- Banker's-note `<context>` strings are written in `{displayCurrency}`.

Few-shot examples in the prompt are templated with the display currency placeholder, replaced server-side at construction time.

Claude does not do FX math. The system prompt's portfolio context block already shows pre-converted EUR values; the API route adds a `displayCurrency` directive and Claude renders accordingly.

---

# Supported currencies

EUR, USD, GBP only at launch. Three-currency scope is deliberate:

- All three use the same milestone step pattern (`1k → 5k → 10k → 50k → 100k → 500k → 1M → 5M`).
- All three are major reserve currencies with stable FX.
- Three covers the target market (Europe + UK + US-adjacent professionals).

Adding more currencies later is straightforward — add to the picker enum, confirm milestone scaling, ship. JPY/SEK/etc. would need step-size adjustments per the audit doc; EUR/USD/GBP do not.

---

# Phased rollout

Four phases. Each is one chat. Phases A–C must run in order. Phase D can run after C or in parallel with C cleanup.

## Phase A · Foundation

**Goal:** Wire the plumbing into the codebase. Nothing visible changes — but every later phase becomes mechanical.

**Schema migration (run in Supabase SQL editor):**

```sql
alter table users
  add column display_currency text not null default 'EUR'
  check (display_currency in ('EUR', 'USD', 'GBP'));
```

**Files to change:**

| File | Change |
|---|---|
| `src/lib/supabase.ts` | Update the `User` type with `display_currency: 'EUR' \| 'USD' \| 'GBP'`. |
| `src/lib/money.ts` *(new)* | `formatMoney(eurValue, displayCurrency)` returning a string. `formatMoneyParts(eurValue, displayCurrency)` returning `{ symbol, amount, code }` for the editorial NetWorthHero split-styling. Both depend on FX rates from the existing `fx_rates` cache via a sync read (FX is fetched ahead of render). |
| `src/lib/hooks.ts` | Add `useDisplayCurrency()`. Reads `users.display_currency`, defaults to `'EUR'`, caches alongside `useUser`. |
| `src/app/api/fx/route.ts` | Verify EUR → USD and EUR → GBP rates are served. Add fetch-on-miss for both if not already present. |
| `src/app/settings/page.tsx` *(new)* | New route. Currency picker (EUR/USD/GBP segmented control or dropdown). Writes `users.display_currency` via PATCH. Otherwise empty — placeholder for future settings. |
| `src/app/api/users/me/route.ts` *(new, or extend existing)* | PATCH endpoint for `display_currency`. Field allowlist. |
| `src/components/BottomNav.tsx` | Surface a settings entry point. **Decision needed at start of phase:** add as a 5th nav item or link from `/profile`. Match existing UX gravity. |

**Acceptance criteria:**

- App still renders identically to before (visually nothing changes — every component still uses `fmt()`, which still hardcodes EUR).
- `users.display_currency` exists and defaults to `'EUR'` for existing users.
- The settings page renders the picker and persists changes.
- `useDisplayCurrency()` returns the persisted value across page navigations.
- `formatMoney(1000, 'USD')` returns a USD-formatted string using the cached FX rate.

**Out of scope:** any callsite swap. Phase B does that.

**Effort:** 1 day.

---

## Phase B · Display swap

**Goal:** The feature becomes visible. Same routes, same functionality, every number on screen reflects the user's display currency.

**First action:** `rg "€"` and `rg "fmt\("` across `src/`. Confirm the inventory matches the audit. Add findings to a tracking list before starting the swap.

**Files to change:**

| File | Change |
|---|---|
| `src/lib/utils.ts` | Either delete `fmt()` or make it a thin wrapper around `formatMoney(value, 'EUR')` to ease the migration. Recommend delete after callsites are swapped. |
| `src/lib/projection.ts` | `getMilestoneProgress(eurTotal, displayCurrency)` scales step sizes per display currency. EUR/USD/GBP all use the same numeric pattern (1k/5k/10k/50k/100k/500k/1M/5M); only the symbol differs. The function takes EUR as input and returns display-currency labels and a display-currency next-milestone target. |
| `src/components/NetWorthHero.tsx` | Use `formatMoneyParts` for the editorial dimmed-symbol styling. Change pill values via `formatMoney`. |
| `src/components/NetWorthChart.tsx` | Y-axis tick formatter and tooltip use `formatMoney`. Today-marker label same. |
| `src/components/AllocationBar.tsx` | Legend row absolute values via `formatMoney`. Bar segments are %, no change. |
| `src/components/PortfolioTab.tsx` | "Largest" stat card, milestone progress label, recent activity preview deltas. |
| `src/components/PositionRow.tsx` | Position value, day-change pill. |
| `src/components/PriceChart.tsx` | Y-axis ticks, tooltip body. |
| `src/components/PriceDisplay.tsx` | Primary EUR-rendering path harmonized with `formatMoney`. Native superscript path stays untouched (it's transparency, in the asset's native currency). |
| `src/components/MiniSparkline.tsx` | Verify no labels or tooltips render currency. If yes, swap; if no, no change. |
| `src/components/MortgageBlock.tsx` | Stat grid (balance, monthly payment), payoff chart Y-axis, TODAY marker, sub-stats. Rate stays as `%`. |
| `src/components/ValueComposition.tsx` | Equity/mortgage labels and segment values. |
| `src/components/BondBlock.tsx` | Computed annual income. Coupon rate stays as `%`. |
| `src/components/asset-detail/TradeableDetail.tsx` | Hero price (with native superscript via `PriceDisplay`), avg buy, live price, total return, activity row deltas. |
| `src/components/asset-detail/RealEstateDetail.tsx` | Equity hero, property value row, mortgage block sub-display, value composition, activity. |
| `src/components/asset-detail/StaticDetail.tsx` | Balance hero. Currency-code subtitle stays as the asset's native currency (transparency). |
| `src/components/asset-detail/ContextNotePrompt.tsx` | Verify whether it shows a value-change delta. If yes, swap. |
| `src/components/asset-detail/CryptoVolatilityBlock.tsx` | Verify percentage-only. If absolute EUR appears, swap. |
| `src/components/DiaryTab.tsx` | Per-entry value deltas (where unit-deltas don't apply), period summary, "On this day" callout, AI summary card (the surrounding component formatting; the AI-generated text inside is updated in Phase C). |
| `src/lib/utils.ts` `getWarnings` (or wherever it lives) | Warning text strings via `formatMoney`. Math (`> 0.4`, `> 0.6`, `> 0.3`) stays. |
| First-switch toast | One-time toast on `users.display_currency` change away from default. Copy: "Display only — your portfolio is unchanged." Track via `localStorage` flag. |

**Acceptance criteria:**

- Switching display currency in `/settings` causes every visible number across Portfolio, Diary, Chat, Profile, and all asset-detail variants to re-render in the new currency.
- Recharts axes and tooltips reflect the change.
- Milestone progress label uses the new currency's symbol and step sizing.
- Existing functionality unchanged: refresh, mutations via chat, profile, sign-out, inline edits (still EUR-implicit at this phase — Phase C fixes inputs).
- No new Supabase queries.
- Mutation logging unchanged.

**Risks:**

- Recharts axis formatters and tooltip components often have their own number formatters. Pass `displayCurrency` and a formatter explicitly into each chart. Don't rely on a global.
- The dimmed-symbol styling on `NetWorthHero` requires `formatMoneyParts` rather than a plain string. Don't regex the string back apart in the component.
- Inline edits on detail pages still type-and-store as if EUR. This is intentional for this phase — Phase C handles input flows. Surface the limitation in a sentence in the settings page or accept the temporary inconsistency.

**Effort:** 1.5 to 2 days.

---

## Phase C · Inputs and Claude prompt

**Goal:** Close the loop. Manual inputs accept the user's display currency. Claude responds in the user's display currency.

**Files to change:**

| File | Change |
|---|---|
| `src/lib/money.ts` | Add `convertToEur(displayValue, displayCurrency, fxRate)`. Synchronous; takes a fresh rate from the cache. |
| `src/lib/hooks.ts` | Add `useFxRate(displayCurrency)` returning the EUR ↔ display rate with freshness state (`fresh` / `stale` / `unavailable`). |
| `src/components/asset-detail/InlineEdit.tsx` | When editing a money field, accept input in display currency. On commit, run `convertToEur` and PATCH the EUR value. Block the commit if FX is `unavailable`; warn on `stale` but allow. Field-type signal needed (money vs non-money) — extend the component's prop API. |
| `src/components/asset-detail/TradeableDetail.tsx` | Avg buy price input — **verify** whether `assets.buy_price` is stored EUR or native (audit open question). If EUR, convert at write. If native, no conversion. |
| `src/components/asset-detail/RealEstateDetail.tsx` | Property value input converts at write to EUR for `assets.value`. The native currency for the property is captured separately (see Phase D). |
| `src/components/MortgageBlock.tsx` | `mortgage_balance` and `monthly_payment` inputs convert at write. `mortgage_rate` is a percentage — no conversion. |
| `src/components/asset-detail/StaticDetail.tsx` | Value input converts at write. Currency-code subtitle is the asset's native currency, separate concern. |
| `src/components/asset-detail/BondBlock.tsx` | `coupon_rate`, `maturity_date`, `issuer`, `isin` — no money fields. Annual income display via `formatMoney`. |
| `src/lib/claude.ts` | `buildSystemPrompt(args)` and `buildOnboardingPrompt(args)` accept `displayCurrency`. Inject directive: render prose totals in `{displayCurrency}`; `<changes>` JSON stays native. Update few-shot examples to use the display-currency placeholder, replaced server-side. Update `<context>` instruction so banker's-note context strings are in display currency. |
| `src/app/api/chat/route.ts` | Pass `displayCurrency` from the user record into `buildSystemPrompt` / `buildOnboardingPrompt`. Goal-setting: when Claude returns a goal target stated in display currency, convert to EUR before INSERT into `goals`. |
| `src/app/api/diary-summary/route.ts` | Pass `displayCurrency` into the diary summary prompt. |
| `src/app/api/assets/[id]/route.ts` | No change. Server stays EUR-only. The client converts before PATCH. |

**Acceptance criteria:**

- A user with display currency USD typing `5000` in a cash balance input writes `~4500 EUR` (today's rate) to `assets.value`.
- The same user sees `$5,000` rendered immediately after the write (round-trip via `formatMoney`).
- Claude's prose responses use the user's display currency. The `<changes>` JSON in chat responses remains native.
- Claude's `<context>` banker's notes appear in the user's display currency in the diary.
- A stale FX cache blocks a write only when no rate is available at all; otherwise warns.
- Goals stated to Claude in display currency are stored in EUR.

**Risks:**

- FX freshness UX. Define `fresh` / `stale` / `unavailable` clearly. Default thresholds: fresh = ≤1h in-process, stale = ≤24h in DB, unavailable = no rate at all.
- The Claude prompt change is the highest-leverage change in the codebase — touches every assistant response. Test with the three currencies on at least one onboarding flow and one mutation flow before merging.
- Few-shot examples that demonstrate prose responses need updating; if they're hardcoded with `€` symbols, the prompt builder must template-substitute.

**Effort:** 1.5 to 2 days.

---

## Phase D · Real-estate native currency

**Goal:** Real estate stops being a EUR-only special case. Each property has a native currency tied to its location.

This phase can run after Phase C ships, or in parallel with Phase C cleanup.

**No schema migration required** — `assets.currency` already exists. Existing real-estate rows have `currency = 'EUR'` (or null) and stay that way; new properties capture native currency on creation.

**Files to change:**

| File | Change |
|---|---|
| `src/lib/claude.ts` | `buildSystemPrompt` and `buildOnboardingPrompt` instruct Claude to capture the property's native currency from the country when adding a real-estate position. NL → EUR, US → USD, UK → GBP. The `<changes>` JSON for a real-estate `add` includes `currency`. |
| `src/app/api/chat/route.ts` | Real-estate `add` action: write the captured native currency to `assets.currency`. Convert the property value from native currency to EUR at write for `assets.value`. |
| `src/components/asset-detail/RealEstateDetail.tsx` | The property's native currency is shown as a subtitle (transparency, like `StaticDetail`'s currency code). Inline-edit on `value` accepts input in display currency, converts to EUR at write — same as Phase C tradeable/static edits. |
| `src/components/MortgageBlock.tsx` | Mortgage fields are in the same native currency as the parent property. Inline edits accept display currency, convert to EUR at write. The native-currency subtitle is shown alongside the property's, for transparency. |
| `src/lib/maps.ts` or new helper | Country → native currency mapping (NL/DE/FR/etc. → EUR, US → USD, UK → GBP). Used by Claude-driven adds and by any UI fallback when geocoding resolves a country. |

**Acceptance criteria:**

- Adding a property in London via chat writes `assets.currency = 'GBP'` and `assets.value` in EUR.
- Adding a property in Amsterdam writes `assets.currency = 'EUR'`.
- The property detail page shows a small native-currency subtitle ("Native: GBP").
- Net worth math is unchanged (still sums EUR-equivalent values).
- Existing real-estate rows with `currency = 'EUR'` continue to work without backfill.

**Risks:**

- Country-to-currency mapping has edge cases (Switzerland → CHF, but CHF is not in our supported list — those properties get `currency = 'EUR'` as a fallback with a soft warning). Document the supported set explicitly in the country-currency helper.
- The native-currency subtitle on the detail page must not be confused with the display-currency primary value. Visual hierarchy matters — the primary number is large and in display currency; the native subtitle is small and dim.
- Mortgage fields currently store EUR-implicit values for existing properties. After Phase D, new properties' mortgage fields are EUR-equivalent values converted from the property's native currency. Same storage convention; the difference is which currency the user typed in.

**Effort:** 1 to 1.5 days.

---

# Always-on rules

These apply to every phase, every PR, every commit:

1. **Storage stays EUR.** Every numeric column in `assets`, `snapshots`, `mutations`, `goals` holds EUR-equivalent values. Native currency lives on `assets.currency` only.
2. **Math stays EUR.** No allocation, concentration, milestone, or snapshot calculation is done in display currency.
3. **Mutation logging.** Any code path that changes an asset (add/edit/remove) writes a row to `mutations`. Currency on the mutation row matches the asset's native currency. `before_value` and `after_value` are EUR-equivalent.
4. **No new dependencies.** Use existing FX cache and frankfurter.app.
5. **Do not refactor unrelated files.**
6. **Match existing patterns.** Follow the redesign-brief.md style for phasing and acceptance criteria.

---

# Open verifications (pre-Phase B)

A 15-minute grep pass at the start of Phase B answers these. They do not block Phase A.

- Exact signature of `fmt()` and `fmtAmount()` in `src/lib/utils.ts`.
- Whether `getWarnings` lives in `src/lib/utils.ts` or `src/app/page.tsx`.
- Whether `assets.buy_price` is stored EUR or native.
- Whether `getMilestoneProgress` already accepts and uses a `currency` argument.
- Whether `CryptoVolatilityBlock` renders any absolute money value.
- Whether `ContextNotePrompt` displays a value-change delta.
- Total count of ad-hoc `€` template literals.
- Whether `MiniSparkline` has a tooltip.
- Whether `/api/fx` already supports USD-base / GBP-base queries or only EUR-base.
- Whether `/api/prices/history` returns EUR consistent with `/api/prices`.

---

# Starting the work

When ready to start Phase A:

> "Read `docs/currency-feature-spec.md` and execute Phase A. Do not start Phase B yet."

Each subsequent phase is a separate chat:

> "Read `docs/currency-feature-spec.md` and execute Phase N."

Wait for review and merge between phases. Do not chain phases in one session.
