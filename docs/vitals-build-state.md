# Volnar Vitals — Build State & Handoff

**Status as of 22 May 2026.** This document records what was built, how the
pieces connect, what is known-broken or unverified, and where to pick up.
It is a living status doc — update it as items close.

**All six original known issues (§4) are RESOLVED as of this revision.** The
feature stands up end-to-end against a real account on both light and dark
themes. What remains before pilot is the §6 validation choices and the
ship/wait call in §8 — not bug-fixing. Three new latent (non-blocking) items
surfaced during the fixes and are tracked in §4b.

Companion docs in project knowledge:
- `vitals-design-spec.md` — UI spec (tokens, typography, component contracts, per-chart geometry). Source of truth for anything visual.
- `vitals-mockup.html` — the canonical rendered mockup. Source of truth for exact markup/SVG.
- `vitals-metrics-reference.md` — per-vital calculation reference (formulas, thresholds, guards). Source of truth for anything about how numbers are derived.

---

## 1. What this feature is

A fifth bottom-nav tab (`/vitals`) presenting a personalized, adaptive set of
portfolio "Vitals" — analytical readings on concentration, real-asset weight,
liquidity, leverage, drawdown vulnerability, cash real yield, and real growth.
Apple Health-inspired: each user sees only the Vitals that apply to their
portfolio; the rest sit dormant in a Library expander.

**Perspective moved to Profile (2026-05-22).** NL/EU/world percentile standing
now lives on the Profile page, computed client-side via `useNetWorth()`. Vitals
is portfolio readings only.

Read-only surface. All portfolio modification still happens through Chat
(consistent with locked product decision #8). Vitals never mutates.

---

## 2. Architecture & data flow

```
Daily cron (/api/cron/snapshot)
  └─ writeSnapshot(user)              [existing — net worth snapshot]
  └─ writeVitalSnapshots(user)        [new — persist.ts]
       └─ computeAllVitals()          [src/lib/vitals/index.ts]
            └─ 7 vital modules         [pure deterministic math]
       └─ upsert vital_snapshots       [one row per applicable vital per day]

Page load (/vitals)
  └─ useVitals() hook                  [src/lib/hooks.ts, sessionStorage cache]
       └─ GET /api/vitals              [route.ts]
            ├─ computeAllVitals()      [live compute — see DRIFT RISK below]
            ├─ generatePulse()         [pulse-generator.ts — Haiku or deterministic]
            └─ returns { vitals, pulse, statStrip, assets,
                          netWorthEur, displayCurrency }

Page load (/profile)
  └─ useNetWorth() hook                [src/lib/hooks/netWorth.ts]
       └─ useAssets() + FX rate        [same formula as Portfolio]
            └─ netWorthEur (live, client-side)
  └─ GET /api/snapshots?range=All      [for trajectory baseline]
       └─ findBaselineSnapshot()       [realGrowth.ts — ≥330-day guard]
  └─ computePerspective()              [perspective.ts — deterministic, no API call]
  └─ page composes primitives + charts + composites
```

**Deterministic vs LLM split (invariant):** all math, totals, bands, and
suggestion logic are deterministic code. The LLM (Haiku) touches exactly one
surface — the Pulse synthesis sentence — and returns null on failure (banner
omitted, nothing breaks).

---

## 3b. Property checkbox (added 2026-05-22)

### Feature summary
A "Property" checkbox on the Vitals page lets mixed-portfolio users (real-estate
+ investable) filter the view to liquid-only. Read-only surface; no mutations;
no schema change.

### Scope descriptor
Each vital module now exports `export const scope: VitalScope` where
`VitalScope = 'liquid' | 'house' | 'both'`. Classifications:

| Vital | scope |
|-------|-------|
| Concentration | both |
| Real-asset weight | house |
| Liquidity posture | liquid |
| Leverage | house |
| Drawdown vulnerability | liquid |
| Cash & real yield | liquid |
| Real growth | liquid |

`VitalScope` is added to `types.ts`; `scope` is added to `VitalResult` and flows
through `runVital()` → `/api/vitals` → `VitalsResponse` without any schema change
(`vital_snapshots.value` is jsonb; scope is code-only metadata).

### Control appearance
Rendered as a hairline pill on the title row (right-aligned, vertically centred to
the "Vitals" serif title). Off state: transparent background, `0.5px solid var(--border)`,
label `var(--text-faint)` 12px. On state: background and border `var(--accent-soft)`,
label `var(--accent-deep)` — the same soft green tint as the Pulse banner. No fill
block, no check, no icon; state is communicated by tint and text colour alone.
`aria-pressed` reflects the boolean; `aria-label="Toggle property in vitals"`.

### Checkbox behaviour
- Rendered only for **mixed portfolios**: assets include at least one `real_estate`
  AND at least one non-`real_estate`. Pure-liquid and pure-property users never see it.
- Adaptive default when no stored value:
  `showProperty = grossPropertyValue / grossAssets >= LENS_DEFAULT_PROPERTY_PCT` (50).
- sessionStorage key: `volnar:vitals-show-property`.
- Active filter: `vital.applies && scopeVisible(vital.scope, showProperty)`.
  - `showProperty = true` → all scopes visible.
  - `showProperty = false` → `scope = 'house'` vitals move to dormant.
- Vitals hidden by the checkbox render in the existing LibraryExpander with
  `reason = 'property-off'`, showing "Hidden while Property is off" instead of
  their normal surfacesWhen text.

### Deferred-recompute note
liquidityPosture, drawdown, and realGrowth are scoped `liquid` but their math
still includes the house. They display whole-portfolio figures when Property is
off. A later recompute pass will exclude the house; cashRealYield is already
house-free. **This recompute is NOT in the current PR.**

### Concentration dual-scope
`ConcentrationValue` now carries both gross fields (over all assets) and
investable fields (over non-real-estate assets):
- `topPositionIsRealEstate: boolean`
- `investableTopPositionPct / Name / Top3Pct` — null when there are no non-property positions.
- `band()` keys off `investableTopPositionPct ?? topPositionPct` (checkbox-independent).
- Card and StatStrip TOP 1 follow the checkbox (gross when on, investable when off).
- When the gross top position is real estate and checkbox is on, the card frames
  the home as a structural anchor and surfaces investable concentration in the sub-line.
- Pulse framing updated: when `topPositionIsRealEstate` is true, the Haiku
  system prompt directs concentration commentary to `investableTopPositionPct`.

### Lens-aware Pulse (added 2026-05-22)
`generatePulse` now accepts a `lens: 'all' | 'liquid'` parameter:

- **`'all'` lens** (default, existing cache path): active set is the full applied
  vitals. System prompt strengthened: when `topPositionIsRealEstate` is true, the
  home is a STRUCTURAL ANCHOR and any concentration commentary must reference
  `investableTopPositionPct`. The gross figure or home position must never be
  framed as a concentration risk. A deterministic safety net catches non-compliance:
  if the generated sentence contains "concentration" or "concentrated" without the
  word "investable" while `topPositionIsRealEstate` is true, the sentence is
  discarded and the deterministic `buildThinPulse` is returned instead.
- **`'liquid'` lens**: input is the active set filtered to `scope ∈ {liquid, both}`
  (i.e. excludes realAssetWeight and leverage). System prompt strictly prohibits
  any mention of the home, property, real estate, real-asset weight, or mortgage.
  Not persisted — held client-side in the `useVitals` session cache.

**Route behaviour (`/api/vitals`):** mixed users (real estate + investable assets)
get both `pulse` (all-assets, cached in `highlights`) and `pulseLiquid` (liquid,
not persisted). Non-mixed users get only `pulse`; `pulseLiquid` is null.

**Client behaviour (`vitals/page.tsx`):** `PulseBanner` shows the all-assets pulse
when Property is on, the liquid pulse when Property is off. Falls back to the
all-assets pulse if `pulseLiquid` is null (non-mixed user or Haiku failure).
Both the PulseBanner `metaLabel` and the "Active vitals · N" eyebrow already read
`activeVitals.length` which is lens-filtered — no change needed there.

**Cache key bump:** the route now stores `PULSE_VER + generated` (`"v2:" + text`)
in `highlights.detail`. Any cached row that does not start with `"v2:"` is treated
as stale regardless of its `expires_at`, forcing a fresh generation with the
improved framing. Old rows are superseded on next load; no migration required.

---

## 3. File inventory

### Schema (migration `20260522_vitals_foundation.sql` — APPLIED)
- `users.country` (text, nullable) — reserved, unused in V1
- `users.birth_year` (integer, nullable) — reserved, unused in V1
- `vital_snapshots` (id, user_id, vital_key, date, value jsonb, band, created_at) + RLS + unique(user_id, vital_key, date) + index
- `vital_highlights` (id, user_id, vital_key, event_type, detail, detected_at) + RLS + index — **BUILT BUT UNUSED** (Phase 2 shift detection)

### Schema (migration `20260522_highlights_pulse_type.sql` — APPLIED)
- Widens `highlights_type_check` to include `'pulse'`. **Required** — without it every Pulse cache write silently failed (see §4 issue #6 / §4c).

### Logic — `src/lib/vitals/`
- `benchmarks.ts` — percentile tables + reference constants. **Now sourced from real data** (ECB HFCS 2021, CBS Netherlands 2023, UBS Global Wealth Report 2025). Includes `USD_PER_EUR` conversion constant and a methodology note (per-household vs per-adult basis). See §4 issue #1.
- `country-defaults.ts` — NL economic constants via `getCountryDefaults()`
- `build-inputs.ts` — **shared input assembly** (`buildVitalsInputs`, `VITALS_SNAPSHOT_WINDOW_DAYS = 400`). Single source both the cron and the route call so they cannot drift. See §4 issue #5.
- `types.ts` — `Band`, `VitalKey`, `VitalUser`, `Snapshot`
- `concentration.ts`, `realAssetWeight.ts`, `liquidityPosture.ts`, `leverage.ts`, `drawdown.ts`, `cashRealYield.ts`, `realGrowth.ts` — the 7 compute modules. `realGrowth.ts` exports `findBaselineSnapshot` and `MIN_BASELINE_AGE_DAYS` (reused by Profile's trajectory guard).
- `index.ts` — `computeAllVitals()` + re-exports
- `perspective.ts` — `computePerspective()`. Consumed by Profile, not the Vitals route. WORLD context line flips below/above `WORLD_TOP_1_PCT_EUR` conditionally.
- `benchmarks.ts` — percentile tables + reference constants. Consumed by Profile via `perspective.ts`.
- `persist.ts` — `writeVitalSnapshots()` (cron-side), now calls `buildVitalsInputs`

### API & generation
- `src/app/api/vitals/route.ts` — GET handler (auth, parallel fetch, compute, cache, response). Does NOT call `computePerspective()` — perspective is computed client-side on Profile.
- `src/lib/pulse-generator.ts` — `generatePulse()` (thin path deterministic, else Haiku)
- `src/app/api/cron/snapshot/route.ts` — MODIFIED (additive `writeVitalSnapshots` call)

### UI — `src/components/vitals/`
Primitives: `PulseBanner.tsx`, `StatStrip.tsx`, `VitalCard.tsx`, `SuggestionStrip.tsx`
Composites: `LibraryExpander.tsx`
Charts (`charts/`): `ConcentrationBars.tsx` *(replaces ConcentrationTreemap — retired 2026-05-23)*, `RealAssetBullet.tsx`, `LiquidityStack.tsx`, `LeverageTrend.tsx`, `DrawdownBars.tsx`, `CashWaterfall.tsx`, `RealGrowthDualLine.tsx`

### UI — `src/components/perspective/`
- `PerspectiveCard.tsx` — moved here from `components/vitals/`. Profile-owned. Caller supplies the eyebrow label; the old section-divider hairline is gone.

### Net worth hook
- `src/lib/hooks/netWorth.ts` — `useNetWorth()`. Derives `netWorthEur` from `useAssets` + `getUsdRate("EUR")` — same formula as Portfolio's inline `useMemo`. Exported from `src/lib/hooks.ts`.

### Page, nav, tokens
- `src/app/vitals/page.tsx` — the page (placeholder → full implementation)
- `src/components/BottomNav.tsx` — MODIFIED (5th tab + elevated Chat ring + `VitalsIcon`)
- `src/components/NavBar.tsx` — MODIFIED (`Tab` type widened to include `"vitals"`)
- `src/app/diary/page.tsx`, `src/app/page.tsx`, `src/app/profile/page.tsx` — MODIFIED (setTab type widened only)
- `src/app/globals.css` — MODIFIED (6 vital tokens both themes: `--surface-deep`, `--accent-deep`, `--negative-deep`, `--amber`, `--amber-deep`, `--amber-soft`; PLUS 5 Perspective theme-aware tokens: `--perspective-card-grad-start`, `--perspective-card-grad-end`, `--perspective-panel`, `--perspective-chip-bg`, `--perspective-dot-border`)
- `src/lib/tokens.ts` — MODIFIED (tokens mirrored)
- `src/lib/hooks.ts` — MODIFIED (`useVitals` added)

---

## 4. Known issues — ALL RESOLVED

| # | Issue | Resolution |
|---|-------|------------|
| 1 | Benchmark percentile tables were illustrative estimates, not verified data. | **RESOLVED.** Replaced with sourced figures: NL median €87,300 (CBS 2021), EU median €109,000 / 90th €496,000 (ECB HFCS 2021), WORLD from UBS GWR 2025 (median ~€8,013, top-1% threshold ~€972k = $1.05M ÷ 1.08). Added `USD_PER_EUR` constant, source citations, and a per-household-vs-per-adult methodology note. Sanity check passed: €87k → NL 50th percentile (was 70th under the placeholder); €600k → NL 90th / EU 91st. |
| 2 | Trajectory "this year" edge case — baseline could be <1yr old but labeled "this year". | **RESOLVED.** Route reuses `findBaselineSnapshot` + `MIN_BASELINE_AGE_DAYS` (330) from realGrowth; passes `netWorth12moAgoEur` only when baseline age ≥ 330 days, else null (chip omitted). Verified: 89-day-history account shows no chip; full-year account does. |
| 3 | Net worth rendered with stray decimals (€44,002.702). | **RESOLVED.** `formatFull` in PerspectiveCard.tsx now uses `Intl.NumberFormat` with `maximumFractionDigits: 0`. €44,002.702 → €44,003. |
| 4 | Dark mode visually unconfirmed. | **RESOLVED.** Eyes-on pass done. Found and fixed: the Perspective card's translucent panels were tuned for the cream light theme and rendered as pale boxes with dark text in dark mode. Fixed via 5 new theme-aware Perspective tokens; light values copied verbatim (zero regression). Active Vital cards, suggestion strips, charts, Pulse, stat strip all confirmed clean in dark from the start. |
| 5 | Two compute paths (cron + route) could drift. | **RESOLVED.** Extracted `buildVitalsInputs` into `build-inputs.ts`; both paths feed identical inputs. Route still computes live (preserves same-day freshness); they agree whenever the portfolio is unchanged. Verified: bands identical across two cron runs, no drift. |
| 6 | Pulse cache could blank for many users at once on a Haiku outage. | **RESOLVED** + uncovered a bigger bug — see §4c. Added serve-stale-on-error (falls back to last sentence regardless of expiry) and 0–6h expiry jitter. |

## 4b. New latent items (non-blocking, surfaced during fixes)

These are correct-as-designed but worth a deliberate decision later:

1. **Trajectory vs realGrowth floor independence.** realGrowth has a 20% baseline-floor guard (`BASELINE_FLOOR_RATIO`); trajectory does not. A user can see a "+15 percentile points this year" trajectory chip while having no Real Growth card, because the two answer different questions and only realGrowth has the floor. Early-history users will see optically large trajectory numbers that are technically correct. Decide later whether trajectory should also respect a floor.
2. **Context-line directional pattern.** The WORLD context line now flips "below/above the top 1% threshold" conditionally. The NL and EU lines are still static strings tuned for the high range — e.g. EU's "above 9 in 10 households across the bloc" would be wrong for a user at the EU 40th percentile. Not an issue for high-net-worth target users, but the clean fix is to make all three context lines derive from their actual percentile band the way WORLD now derives from the threshold.
3. **Optically large trajectory for new users** (same root as #1) — see Library "surfaces after a year" copy for realGrowth as the mitigating frame.

## 4c. Important discovery: Pulse cache was non-functional before this build's fixes

While fixing issue #6, found that `highlights.title` is NOT NULL and was
missing from the Pulse insert — so **every Pulse cache write had been
silently failing**, meaning Haiku was called on *every* page load, not once
per 24h. Fixed by adding `title: 'generated'` to the insert and the
`20260522_highlights_pulse_type.sql` migration (the type check also rejected
`'pulse'`). **Implication:** Haiku usage/latency attributable to Pulse should
drop sharply now that the cache actually persists. If you were baselining
model spend or response time, re-baseline after this change.

---

## 5. Deferred / future work (intentional, not bugs)

- **Shift detection.** Pulse meta shows "N vitals · 0 shifted" — the "0" is hardcoded. Real shift detection (diffing today's bands vs prior) uses the `vital_highlights` table, which is built but unwired. (Phase 2)
- **The 4 extra dormant Vitals from original design** — Activity Cadence, Diversification Depth, Position Aging, Yield Gap — were NOT built as compute modules. V1 ships **7 vitals total**. "Dormant" in V1 = whichever of the 7 don't apply to a given user. The "11 vitals" figure from early design is aspirational toward the full library. **The page correctly uses the real count** (`data.vitals.length`), not 11. (Phase 2/3)
- **Per-vital deep-dive routes** (e.g. `/vitals/concentration`). V1 uses chat-handoff as the deep-dive path. (Phase 2)
- **Age cohort & DE/UK support.** `users.country` and `users.birth_year` columns exist; `getCountryDefaults()` and `computePerspective()` accept the args but always return NL. (Phase 2/3)
- **Relevance scoring** for active-vs-library promotion ordering. (Phase 3)
- **Suggestion-strip copy variation.** Deterministic copy is correct but becomes wallpaper after repeated views. Candidate for first post-pilot iteration — light phrasing variation or surfacing only on change.
- **Time-range selector** (Now / 3M / 1Y) and per-card trend drill-in. (Phase 2)

---

## 6. Pre-pilot validation (remaining choices, not bug-fixes)

The six known issues are closed. What's left before pilot is judgment calls:
1. **Empty state on a real zero-asset account** — exercise it live (CTA → `/chat?seed=onboarding-class`). Logically sound but not yet run against a real fresh account.
2. **New-user experience** — confirm realGrowth + trajectory absence for the first year is explained by the Library "surfaces after a year" copy, so the page doesn't feel broken when it's least populated.
3. **Benchmark refresh cadence** — the sourced figures (§4 #1) need an annual refresh; note the source vintages in `benchmarks.ts` and set a reminder.
4. **Decide the §4b latent items** — particularly whether the EU/NL context lines should become percentile-adaptive before real lower-net-worth users see them.

---

## 7. Decision log (settled, do not relitigate without reason)

- Tab name "Vitals"; route `/vitals`; nav order Portfolio · Vitals · Chat · Diary · Profile (Chat at center position 3 of 5, elevated ring). Vitals sits at position 2 to signal it as a primary surface; Profile moved to the far-right edge per platform convention. Supersedes the earlier Portfolio · Diary · Chat · Profile · Vitals order.
- **Perspective moved to Profile (2026-05-22).** An earlier exploration of moving it to Profile was reverted, but the move was re-executed correctly with a dedicated `useNetWorth()` hook and a client-side compute path. Vitals is portfolio readings only; `computePerspective()` is no longer called by the Vitals route.
- Read-only surface; chat is the only modification path.
- Deterministic math, LLM only for Pulse sentence.
- No filters, no per-vital customization/mute, no badges, no leaderboards, no "congratulations" moments.
- Excluded metrics (deliberate): Sharpe ratio, TWR vs MWR, dividend calendars, S&P benchmark line, ESG, Monte Carlo, sector/geographic breakdowns.
- Suggestion strips are inline and color-coded (context/warn/alert); suggestion math is deterministic in code.
- Drawdown scenarios fixed at equities −30% / crypto −50% / housing −15%.

---

## 8. Where to pick up

The feature is built, all six known issues are closed, and it renders correctly
end-to-end on both themes against a real account. Remaining before "shipped":
- The §6 validation choices (empty-state live test, new-user framing, benchmark refresh cadence, the §4b latent-item decisions). These are judgment calls, not bugs.

After that, the original pre-pilot list still stands and was deferred to build
this: chat scroll-back bug, two DB indexes, analytics wiring. Open question
worth a deliberate call: does Vitals ship IN the pilot, or wait while the
original three close and the pilot launches on the smaller proven surface?
Both are defensible; the risk is shipping a broader-than-planned pilot without
having decided to.

**For the next chat:** start from §4b (latent items), §6 (remaining choices),
and §7 (decision log). The feature itself needs no re-derivation — it works.
Discussion topics flagged for separate chats: UI refinements, metric
calculation tuning, the percentile-adaptive context lines, shift detection
(Phase 2), and the ship/wait pilot call.
