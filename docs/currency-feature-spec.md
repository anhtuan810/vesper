# Display Currency Parameterization — Feature Spec

## Status: all four phases shipped

| Phase | Status |
|---|---|
| A — Foundation | Shipped |
| B — Display swap | Shipped |
| C — Inputs + Claude prompt | Shipped |
| D — Real-estate native currency | Shipped |

Amendments applied since this spec was written:

- **Phase A's `src/app/settings/page.tsx` was never created.** Per `redesign-decisions.md` Decision 5, the entire `/settings` route was dropped and the currency picker landed on Profile in the Preferences section. The `users.theme` column was added in the same migration as `users.display_currency`.
- **Phase C's input flows were narrower than originally planned.** Per Decision 8, asset detail pages became read-only (`InlineEdit.tsx` deleted entirely), and per the PR 18/19 cleanup the Profile context fields also became read-only. The only remaining input path is chat, where prompts are parameterized with `displayCurrency` and goal targets are server-converted to EUR via `toEur()` before INSERT. Avg buy price, mortgage balance, property value — all now flow through chat, not inline edits.
- **`PriceDisplay`'s "native superscript" path was simplified during the visual restyle** (PR 9). The display currency hero treatment now uses `formatMoneyParts` with the editorial dimmed-prefix styling per the locked mockup; native currency for cash/bonds is shown as a small uppercase subtitle below the hero.
- **Number formatting is forced to `nl-NL` locale** for all currencies regardless of user locale — `€616.086`, `$616.086`, `£616.086` (dot thousand separator, comma decimal). Deliberate brand-consistency override applied in PR 16. Not in the original spec.

The phased plan below is preserved as the historical record of how the work was structured.

---

This document is the source of truth for the display currency feature. Read it in full before starting any phase. It defines the architectural principle, the supported currencies, the phased rollout, and the constraints.

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
3. Formats with the display currency's symbol (locale forced to `nl-NL` per the PR 16 amendment for brand consistency).

When the user has not changed their preference, `displayCurrency = EUR` and the conversion is a no-op (rate of 1).

## Inputs

(Originally planned for inline-edit flows. Per Decision 8, all asset modifications now happen through chat. Goal targets stated in display currency are server-converted to EUR before INSERT. See the status header above.)

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

Four phases. Each was one chat. Phases A–C ran in order. Phase D ran after C.

## Phase A · Foundation

**Goal:** Wire the plumbing into the codebase. Nothing visible changes — but every later phase becomes mechanical.

**Schema migration:**

```sql
alter table users
  add column display_currency text not null default 'EUR'
  check (display_currency in ('EUR', 'USD', 'GBP'));
```

Per the Decision 5 amendment, the same migration also added `users.theme`.

**Files touched:**

| File | Change |
|---|---|
| `src/lib/supabase.ts` | Update the `User` type with `display_currency: 'EUR' \| 'USD' \| 'GBP'`. |
| `src/lib/money.ts` *(new)* | `formatMoney(eurValue, displayCurrency)`, `formatMoneyParts(eurValue, displayCurrency)`, `convertToEur(displayValue, displayCurrency)`. |
| `src/lib/hooks.ts` | Add `useDisplayCurrency()`. |
| `src/app/api/fx/route.ts` | Verify EUR → USD and EUR → GBP rates are served. |
| `src/app/api/users/me/route.ts` *(new)* | PATCH endpoint with field allowlist (later extended in Decision 5 to also accept `theme` and `avatar_url`). |
| `src/app/profile/page.tsx` | Currency picker added to Preferences section (per Decision 5 amendment, replacing the originally-planned `/settings` route). |

**Acceptance criteria:**

- `users.display_currency` exists and defaults to `'EUR'` for existing users.
- The currency picker renders and persists changes.
- `useDisplayCurrency()` returns the persisted value across page navigations.
- `formatMoney(1000, 'USD')` returns a USD-formatted string using the cached FX rate.

---

## Phase B · Display swap

**Goal:** Same routes, same functionality, every number on screen reflects the user's display currency.

**Files touched:**

`src/lib/utils.ts` (`fmt` → wrapper around `formatMoney`), `src/lib/projection.ts`, `src/components/NetWorthHero.tsx`, `src/components/NetWorthChart.tsx`, `src/components/PortfolioTab.tsx`, `src/components/PositionRow.tsx`, `src/components/PriceChart.tsx`, `src/components/PriceDisplay.tsx`, `src/components/MiniSparkline.tsx`, `src/components/MortgageBlock.tsx`, `src/components/ValueComposition.tsx`, `src/components/BondBlock.tsx`, all three `asset-detail/*Detail.tsx` files, `src/components/DiaryTab.tsx`, `getWarnings` text strings.

First-switch toast added: "Display only — your portfolio is unchanged." Tracked once in `localStorage`.

**Acceptance criteria:**

- Switching display currency in Profile causes every visible number to re-render in the new currency.
- Chart Y-axis labels and scrub tooltip reflect the change.
- Milestone progress label uses the new currency's symbol and step sizing.

---

## Phase C · Inputs and Claude prompt

**Goal:** Manual inputs accept the user's display currency. Claude responds in the user's display currency.

Per the Decision 8 amendment, inline-edit input flows were obsoleted before Phase C completed — `InlineEdit.tsx`, `DeleteAssetButton.tsx`, and `ContextNotePrompt.tsx` were deleted. The Phase C work narrowed to the chat path and goal-setting.

**Files touched:**

| File | Change |
|---|---|
| `src/lib/money.ts` | `convertToEur(displayValue, displayCurrency)` (synchronous; takes a fresh rate from the cache). |
| `src/lib/hooks.ts` | `useFxRate(displayCurrency)` returning the EUR ↔ display rate with freshness state (`fresh` / `stale` / `unavailable`). |
| `src/lib/claude.ts` | `buildSystemPrompt(args)` and `buildOnboardingPrompt(args)` accept `displayCurrency`. Inject directive: render prose totals in `{displayCurrency}`; `<changes>` JSON stays native. Update few-shot examples with the display-currency placeholder. Update `<context>` instruction so banker's-note context strings are in display currency. |
| `src/app/api/chat/route.ts` | Pass `displayCurrency` from the user record into `buildSystemPrompt` / `buildOnboardingPrompt`. Goal-setting: convert display-currency goal targets to EUR before INSERT. |
| `src/app/api/diary-summary/route.ts` | Pass `displayCurrency` into the diary summary prompt. |

---

## Phase D · Real-estate native currency

**Goal:** Each property has a native currency tied to its location.

No schema migration required — `assets.currency` already exists.

**Files touched:**

| File | Change |
|---|---|
| `src/lib/claude.ts` | Claude instructed to capture the property's native currency from country on real-estate adds. NL → EUR, US → USD, UK → GBP. |
| `src/app/api/chat/route.ts` | Real-estate `add` action: write the captured native currency to `assets.currency`. Convert the property value from native currency to EUR at write for `assets.value`. |
| `src/lib/country-currency.ts` *(new)* | `countryToCurrency()` mapping. |

**Acceptance criteria:**

- Adding a property in London via chat writes `assets.currency = 'GBP'` and `assets.value` in EUR.
- Adding a property in Amsterdam writes `assets.currency = 'EUR'`.
- Existing real-estate rows with `currency = 'EUR'` continue to work without backfill.

---

# Always-on rules

1. **Storage stays EUR.** Every numeric column holds EUR-equivalent values. Native currency lives on `assets.currency` only.
2. **Math stays EUR.** No allocation, concentration, milestone, or snapshot calculation is done in display currency.
3. **Mutation logging.** Any code path that changes an asset (add/edit/remove) writes a row to `mutations`. Currency on the mutation row matches the asset's native currency. `before_value` and `after_value` are EUR-equivalent.
4. **No new dependencies.** Use existing FX cache and frankfurter.app.
5. **Do not refactor unrelated files.**
