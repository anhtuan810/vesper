# Volnar Vitals — Metrics Reference

**Purpose:** the calculation bible for every Vital and for the Perspective
percentiles. Consult this when discussing whether a number is right, tuning a
threshold, or adding a vital. Pairs with `vitals-build-state.md` (status) and
`vitals-design-spec.md` (UI).

**Conventions used below:**
- *Net worth* = gross assets − liabilities (mortgages). Computed via the app's
  existing `computeNetWorth` helper (USD bridge for FX), not reimplemented in
  vital modules.
- *Gross portfolio / gross assets* = sum of asset current values, before
  subtracting any mortgage.
- Each module exports `applies()`, `compute()`, `band()`, and `scope`. All pure,
  deterministic, no DB or LLM. Band values: `green` | `amber` | `red`.
- All economic constants come from `getCountryDefaults()` (V1 = NL).
- **Income pensions are excluded (2026-06).** Assets where `isIncomePension` (`pension_kind` `db` | `state`) are filtered out at the top of `compute` for the five aggregating vitals — concentration, real-asset weight, liquidity posture, leverage, drawdown — **before any value math**; `build-inputs.ts` also skips them in EUR-normalization, and the shared `computeNetWorth` excludes them. They are off-balance future income, not holdings. Capital pensions (`dc` / null) are unchanged, and a capital pension still maps to the liquidity `locked` tier. (Commit `2a7bb26`.)

### Scope descriptor

Each vital module exports `export const scope: VitalScope`, where
`VitalScope = 'liquid' | 'house' | 'both'`. The scope is metadata only — no
computation changes. It drives the Property checkbox on the Vitals page: when
the checkbox is off, `scope = 'house'` vitals move to the Library (dormant);
`'liquid'` and `'both'` remain visible. The scope is also serialised on
`VitalResult` and passed through `/api/vitals` without any schema change
(`vital_snapshots.value` is jsonb; scope lives in code, not the DB).

| Vital | scope |
|-------|-------|
| Concentration | both |
| Real-asset weight | house |
| Liquidity posture | liquid |
| Leverage | house |
| Drawdown vulnerability | liquid |
| Cash & real yield | liquid |
| Real growth | liquid |

**Deferred-recompute note (docs only, not code):** liquidityPosture, drawdown,
and realGrowth are scoped `liquid` but their math still includes the house
position. They display whole-portfolio figures when Property is off. A later
recompute pass will exclude the house from their math; cashRealYield is already
house-free and needs no change.

---

## 1. The 7 V1 Vitals

### 1.1 Concentration
**Measures:** exposure to a single position and to the top three, on an **equity / net-worth basis** (whole portfolio) and by investable value (non-real-estate positions).
**`applies`:** `assets.length >= 2`
**`scope`:** `both`
**`compute`** → `{ topPositionPct, topPositionName, top3Pct, weeksAboveThreshold, topPositionIsRealEstate, investableTopPositionPct, investableTopPositionName, investableTop3Pct }`
- All-asset fields use **equity** for real estate (`value − computeCurrentBalance`, i.e. the amortized balance), the same basis as net worth; non-real-estate positions are unlevered so equity = value:
  - `topPositionPct` = largest position's equity ÷ equity net worth × 100
  - `topPositionName` = that position's name
  - `top3Pct` = sum of top three positions' equity ÷ equity net worth × 100
  - `weeksAboveThreshold` = count of weekly snapshots in the last 26 weeks where top1 > 40%. **0 if no snapshot history.**
  - `topPositionIsRealEstate` = boolean; true when the (equity) top position is a real-estate asset
- Investable fields (over assets where `type !== 'real_estate'`):
  - `investableTopPositionPct` / `investableTopPositionName` / `investableTop3Pct` — **null when there are no non-property positions** (property-only portfolio)
**`band`:** keys off `investableTopPositionPct ?? topPositionPct`. A primary residence is not a decision the user can act on; severity tracks the rebalanceable book, checkbox-independent. `> 50` → red · `> 35` → amber · else green
**Display basis (2026-06):** the headline, top-3, AND the per-position **bar** are all equity-based — the bar feed (`/api/vitals` `minimalAssets`) sends real estate at `value − computeCurrentBalance`, so the bars divide by equity net worth and match the headline and the allocation donut (previously the bar used a gross/gross basis and read higher than the headline). The Vitals input path (`build-inputs.ts`) EUR-normalizes `mortgage_balance` and `monthly_payment` alongside `value`, so equity is computed entirely in EUR for non-EUR property; `computeNetWorth` uses the amortized balance so the denominator equals the Portfolio hero. Property checkbox off = investable hero ("of investable assets"), bars renormalized to 100% over non-RE positions.
When `topPositionIsRealEstate` is true and checkbox is on: hero shown as "default" (neutral, never red); sub-line frames the home as a structural anchor and surfaces investable concentration.
**Pulse framing:** the Pulse generator receives the lens as a parameter. For the
all-assets lens, a deterministic safety net checks that any generated sentence with
"concentration" language also contains "investable"; if not, the sentence is
replaced with the deterministic `buildThinPulse` output. For the liquid lens, the
input vitals exclude realAssetWeight and leverage, and the system prompt prohibits
any property or mortgage mention.
**Edge case:** near-single-asset portfolios (one position 95%+) are valid, not bugs — the top bar fills almost the full track width with the remaining positions as short bars beneath it.

### 1.2 Real-asset weight
**Measures:** how much of net worth is tied up in property equity.
**`applies`:** `assets.some(a => a.type === 'real_estate')`
**`compute`** → `{ propertyEquityPct, percentileEU, trend12moPts }`
- `propertyEquityPct` = (property value − mortgage balance) ÷ net worth × 100
- `percentileEU` = interpolation against `EU_HOMEOWNER_RE_WEIGHT_PCT` (63, treated as median anchor; linear estimate for V1)
- `trend12moPts` = current minus the value ~365 days ago. **0 if unavailable.**
**`band`:** `> 75` → amber (over-concentrated in property) · `< 10` → amber (under) · else green
**Display basis:** EQUITY ÷ net worth. Card sub-line must say **"equity / net worth"**. Note: Concentration and Real-asset weight measure the same house two different ways (gross vs equity) — both legitimate, must be labeled.

### 1.3 Liquidity posture
**Measures:** how much of net worth is deployable, by time-to-cash tier.
**`applies`:** always (`true`)
**`compute`** → `{ deployable1wPct, sameDayPct, oneWeekPct, oneMonthPct, sixMonthPlusPct, lockedPct, liquidBufferPct }`
- Tier mapping by asset type: cash → same-day · stocks/etf/crypto → 1-week · bonds → 1-month · real_estate → 6-month+ · capital pension → locked (income pensions are excluded entirely — see Conventions)
- Each tier as % of net worth
- `deployable1wPct` = sameDay + 1-week
- `liquidBufferPct` = `getCountryDefaults().liquidBufferTargetPct` (15)
**`band`:** `deployable1wPct < liquidBufferPct` → red · else green

### 1.4 Leverage
**Measures:** loan-to-value and debt load on property.
**`applies`:** `assets.some(a => a.type === 'real_estate' && a.mortgage_balance != null)`
**`compute`** → `{ ltvPct, debtToAssetsPct, mortgageRate, portfolioYield, trend: [{date, ltv}] }`
- `ltvPct` = total mortgage balance ÷ total property value × 100
- `debtToAssetsPct` = total debt ÷ gross assets × 100
- `mortgageRate` = from the asset's mortgage record
- `portfolioYield` = best trailing yield estimate available, else 0
- `trend` = LTV per monthly snapshot over last 12 months (empty array if none)
- Uses `computeCurrentBalance()` from `src/lib/mortgage.ts` for current balance
**`band`:** `ltvPct > 75` → red · `> 50` → amber · else green

### 1.5 Drawdown vulnerability
**Measures:** net-worth loss under a fixed simultaneous market shock.
**`applies`:** `net worth > 0`
**`compute`** → `{ equitiesShockEur, cryptoShockEur, housingShockEur, combinedShockEur, postShockNwEur, shockPctOfNw }`
- Fixed scenarios: equities −30% · crypto −50% · housing −15%
- Each applied to that asset-class **gross** exposure (housing shock is on gross property value, before mortgage)
- `combinedShockEur` = sum of the three
- `postShockNwEur` = net worth − combined
- `shockPctOfNw` = combined ÷ net worth × 100
**`band`:** `shockPctOfNw > 40` → red · `> 25` → amber · else green
**Note:** scenario severities are constants; surfaced with a "2008-style" framing in copy.

### 1.6 Cash & real yield
**Measures:** real (inflation- and tax-adjusted) yield on cash holdings.
**`applies`:** cash position `> 5%` of net worth
**`compute`** → `{ cashEur, cashPctOfNw, savingsRatePct, inflationDragPct, box3TaxPct, realYieldPct, annualErosionEur }`
- Rates from `getCountryDefaults()`: savings 3.4, inflation 3.7, box-3 tax ≈ 1.0
- `realYieldPct` = savings − inflation − box3 tax = **−1.3%** (NL, current constants)
- `annualErosionEur` = cashEur × realYieldPct ÷ 100 (negative when eroding)
**`band`:** `realYieldPct < −2` → red · `< 0` → amber · else green

### 1.7 Real growth
**Measures:** inflation-adjusted net-worth growth over the trailing year.
**`applies`** (ALL must hold):
1. `snapshots != null && snapshots.length >= 30`
2. baseline snapshot age `>= MIN_BASELINE_AGE_DAYS` (330) — find snapshot closest to 365 days ago; require it actually be ~a year old
3. baseline net worth `>= BASELINE_FLOOR_RATIO` (0.20) × current net worth
**`compute`** → `{ nominal12moPct, real12moPct, inflationDragPct, series: [{date, nominal, real}] }`
- `nominal12moPct` = net worth now vs baseline
- `real12moPct` = nominal − inflation (from country defaults)
- `series` = monthly points, nominal index + inflation-adjusted real index
- Uses shared `findBaselineSnapshot(snapshots)` helper (returns `{snapshot, ageDays}` or null) so `applies` and `compute` never disagree on the baseline
- Defensive: if baseline null inside compute, returns zeroed struct (no division by tiny base)
**`band`:** `real12moPct < −2` → red · `< 0` → amber · else green
**Guards rationale:** without (2) and (3), a user's first-ever snapshot (near-empty portfolio) becomes the baseline and the percentage explodes — a +640% reading was observed pre-guard. Under-reporting (no card) beats printing a fantasy figure. When suppressed, realGrowth shows as a dormant Library vital with a "surfaces after a full year of history" line.

---

## 2. Perspective percentiles

**Renders on:** Profile page (moved from Vitals on 2026-05-22). Computed
client-side via `useNetWorth()` + `computePerspective()`; not called by the
Vitals API route. Math and thresholds are unchanged.

**Function:** `computePerspective(netWorthEur, country, birthYear, netWorth12moAgoEur?)`
**Returns:** `{ netWorthEur, rows: [NL, EU, WORLD], trajectory }`

**Per-region percentile:** linear interpolation between the two bracketing
percentile thresholds in the region's table. Below lowest bracket → clamp toward
0; above 99th → cap at 99.9. Rounded to one decimal.

**Context lines (deterministic, per region):**
- NL → "comparable to homeowners with paid-down mortgage and modest pension"
- EU → "above 9 in 10 households across the bloc"
- WORLD → "below the world top 1% threshold (~€940k)"

**Trajectory:** if `netWorth12moAgoEur > 0`, compute NL percentile for that past
value and return `{ pointsThisYear: round(currentNL − pastNL), region: 'NL' }`;
else null. **The route only passes a non-null baseline when the baseline
snapshot is ≥ 330 days old** (`MIN_BASELINE_AGE_DAYS`, reused from realGrowth via
`findBaselineSnapshot`), so sub-1-year users correctly get no trajectory chip.
Note: trajectory does NOT apply realGrowth's 20% baseline-floor guard, so it can
show a chip even when the Real Growth card is suppressed (see build-state §4b).

**WORLD context line:** derives from `WORLD_TOP_1_PCT_EUR` (formatted ~€972k)
and flips between "below" and "above the world top 1% threshold" conditionally
on net worth. NL and EU context lines are still static high-range strings (see
build-state §4b item 2).

**`country` / `birthYear`:** accepted but unused in V1 — always NL/EU/WORLD rows.
Reserved for age-cohort and DE/UK support.

**"You" marker x-position (distribution chart):**
`x = log10(netWorthEur / 1000) / log10(10000) × 310 + 15`, clamped to [15, 325]
on the 340-wide viewBox. (e.g. €600k → x ≈ 230.3, just left of the €1M tick.)

---

## 3. Constants

### Benchmark tables (`benchmarks.ts`) — SOURCED (refresh annually)
Sourced from ECB HFCS 2021 wave + CBS Netherlands (NL/EU) and UBS Global
Wealth Report 2025 (WORLD). **Methodology caveat:** NL/EU are per-HOUSEHOLD
net wealth; WORLD is per-ADULT wealth (USD, converted at `USD_PER_EUR` ≈ 1.08).
These bases are not directly comparable — documented in the file. Format:
percentile → EUR threshold. Anchor values (intermediate brackets interpolated):

| Pctl | NL | EU | WORLD |
|------|------|------|------|
| 50 (median) | 87,300 | 109,000 | ~8,013 |
| 90 | ~590,000 | 496,000 | — |
| 99 | ~2,500,000 | ~2,000,000+ | ~972,000 |

Key anchors and their sources:
- NL median €87,300 (CBS 2021). NL sits *below* the euro-area median.
- NL concentration: top 10% hold 56%, top 1% ~23%, top 0.1% ~10% (CBS 2023) — shapes the NL tail.
- EU median €109,000; 90th €496,000 (ECB HFCS); ~96th ≈ €1,000,000 (HFCS-derived). Wave-2 quintile cut-offs €7,500 / €60,500 / €154,300 / €308,900 guided lower brackets.
- WORLD median per adult ~$8,654 (≈€8,013); top-1% threshold ABOVE $1M (~$1.05M → ~€972k). UBS pyramid: >$1M = top 1.6% (60M adults).

Reference constants: `WORLD_TOP_1_PCT_EUR` ≈ 972,000 · `USD_PER_EUR` ≈ 1.08
(documented vintage) · `NL_AVG_LTV_PCT` = 52 · `EU_HOMEOWNER_RE_WEIGHT_PCT` =
63 (consistent with HFCS owner-occupier cross-tabs; aggregate HMR share of
euro-area wealth is ~50%) · `WORLD_ADULTS_BN` = 5.4 (UBS ~5.36bn) ·
`EU_COUNTRIES` = 27.

**Sanity check (verified):** €87k → NL 50th · €300k → NL 77.5th / EU 77th /
WORLD 89.8th · €600k → NL 90th / EU 91st / WORLD 94th · €1.2M → NL 95th / EU
96th / WORLD 99.9th (capped). The €87k → NL median landing is the key check
that the curve is honest (the prior placeholder put NL median at the 70th).

### Country defaults (`country-defaults.ts`, NL — refresh quarterly)
`inflationPct` 3.7 · `bestSavingsRatePct` 3.4 · `ecbDepositRatePct` 3.0 ·
`wealthTaxBox3PctApprox` 1.0 · `mortgageRateRangePct` [3.51, 4.79] ·
`liquidBufferTargetPct` 15

---

## 4. Band threshold summary

| Vital | red | amber | green |
|-------|-----|-------|-------|
| Concentration | investable top1 > 50% (falls back to gross when no investable) | investable top1 > 35% | else |
| Real-asset weight | — | > 75% or < 10% | else |
| Liquidity posture | deployable1w < 15% | — | else |
| Leverage | LTV > 75% | LTV > 50% | else |
| Drawdown | shock > 40% NW | shock > 25% NW | else |
| Cash real yield | < −2% | < 0% | else |
| Real growth | real < −2% | real < 0% | else |

All thresholds are named constants or inline literals in their module — single
point of change when tuning. Document any change here.

---

## 5. Adding a new vital (pattern)

1. Create `src/lib/vitals/<key>.ts` exporting `applies`, `compute`, `band` and its `ValueType`.
2. Add the key to `VitalKey` in `types.ts`.
3. Register it in `computeAllVitals` (`index.ts`).
4. Build a chart component in `src/components/vitals/charts/` (pure SVG, props = the ValueType).
5. Add the card mapping (eyebrow, hero, subLine, rightStat, benchLine, suggestion builder) in `vitals/page.tsx`.
6. Add a Library "surfacesWhen" line for when it's dormant.
7. If it needs new persisted data, it flows through `persist.ts` automatically (it iterates all applicable vitals).
8. Update this doc and `vitals-build-state.md`.
