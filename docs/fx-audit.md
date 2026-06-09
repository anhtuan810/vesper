# FX / Currency Audit

**Date**: 2026-06-09  
**Scope**: Every place a currency conversion or value aggregation occurs — read-only survey, no code changes.  
**Goal**: Map the current "everything normalised to USD" architecture so a future migration to "native per-asset values, stored breakdown by currency, converted directly to the user's home/reporting currency" is safe.

---

## 1. Conversion Touchpoints

| Location | What happens | Rate source | Direction |
|---|---|---|---|
| `src/lib/fx.ts · getUsdRates()` | Fetches live ECB/open-rates feed; returns `{ EUR: 0.89, GBP: 0.76, … }` meaning **1 USD = N quote** | External API | live |
| `src/lib/fx.ts · getHistoricalUsdRates(date)` | Same schema, keyed by `YYYY-MM-DD`; used during snapshot writes | External API / cache | historical |
| `src/lib/fx.ts · historicalFxRate(rates, cur)` | Extracts a single rate from a historical rates map | — | lookup |
| `src/lib/fx.ts · toUsd(amount, currency, rates)` | `currency === "USD" ? amount : amount / rates[currency]` | passed-in | native → USD |
| `src/lib/money.ts · toUsdClient(amount, from)` | Same division pattern; uses module-level `fallbackRates` seeded `{ EUR: 0.89, GBP: 0.76 }` at import time | fallback or live `usdRates` atom | native → USD |
| `src/lib/money.ts · formatMoney(amount, from, to)` | `amount → USD (toUsdClient) → to-currency (multiply by rates[to])` — always USD bridge | live atom | display only |
| `src/lib/snapshot.ts · rateAt(date, cur)` | Returns historical rate for `(date, cur)` pair from precomputed map | `getHistoricalUsdRates` | lookup |
| `src/lib/snapshot.ts · computeRow → contribution` | Each asset: `equity / rate` (native → USD). Real estate: `balFn`, `tFn` produce native equity, then `/ rateAt(anchor, cur)` | historical | native → USD |
| `src/lib/snapshot.ts · writeSnapshot` | Aggregates USD contributions per type into `breakdown`; sums to `total_value` (USD) | historical | stored in DB |
| `src/app/api/snapshots/route.ts` | Attaches per-row `fx: { EUR: …, GBP: … }` from stored or fetched rates | historical / live | DB → client |
| `src/components/NetWorthChart.tsx` | `p.total_value * (p.fx?.[displayCurrency] ?? displayRate)` — historical rates for stored rows, live for today's tip | historical + live | USD → display |
| `src/lib/chat/build-inputs.ts · toEur` | `toUsdSync(amount, currency) * eurRate` — double bridge: native → USD → EUR | live | vitals only |
| `src/components/asset-detail/RealEstateDetail.tsx` | `formatMoney(equity, asset.currency, displayCurrency)` at current live rate | live | display only |

---

## 2. Stored Schema

**`snapshots` table**

| Column | Type | Currency |
|---|---|---|
| `total_value` | numeric | **USD** |
| `breakdown` | jsonb `{ real_estate: n, … }` | **USD** |
| `fx` | jsonb (optional) `{ EUR: n, GBP: n }` | rate: 1 USD = N |

All historical values are stored once in USD at the rate that prevailed on the snapshot date. There is no per-currency native breakdown in the DB.

---

## 3. Where Divergence Can Occur

| Scenario | Detail |
|---|---|
| **Property detail vs portfolio chart** | The detail page computes `equity = asset.value − computeCurrentBalance(asset)` and converts at the **current** live rate. The portfolio chart converts the **stored USD snapshot** at the **historical** rate on the snapshot date. These will differ whenever the FX rate has moved since the snapshot was written. |
| **`build-inputs.ts` double bridge** | `native → USD → EUR` introduces two rounding steps; a native EUR asset converted to USD then back to EUR will not necessarily round-trip exactly due to floating-point. |
| **`formatMoney` fallback rates** | `money.ts` seeds module-level fallback rates at import time. If the live rate atom hasn't loaded yet, amounts are converted at stale fallback rates (EUR 0.89, GBP 0.76). This causes the USD→EUR flash visible on property detail page load. |
| **Today's live tip** | `NetWorthChart` appends a live tip point using the **current** live rate, not a stored historical rate, so the rightmost dot can jump on every page load if FX has moved. |
| **Snapshot date vs calendar-month anchor** | Real-estate values are anchored to `YYYY-MM-01` (month-start) but FX rates are fetched per snapshot date. A property bought mid-month will use the month-start value but the per-day FX rate, introducing a minor mismatch. |

---

## 4. Migration Dependency Order

To move from "USD normalisation" to "native per-asset, convert directly to home currency":

1. **Schema** — Add a `native_breakdown` jsonb column to `snapshots`: `{ assetId: { amount, currency } }`. Keep `total_value` (USD) for backwards compatibility during transition.
2. **`fx.ts`** — Add a `toDisplay(amount, from, to, rates)` helper that converts `from → to` without bridging through USD when `from !== "USD"`.
3. **`snapshot.ts · writeSnapshot`** — Populate `native_breakdown` alongside existing USD columns. No removal yet.
4. **`/api/snapshots`** — Expose `native_breakdown` in the response so clients can convert directly.
5. **`NetWorthChart`** — Switch to summing `native_breakdown` entries using `toDisplay(amount, nativeCur, displayCur, rates[date])` instead of `total_value * fx[displayCur]`.
6. **`money.ts`** — Replace the `toUsdClient → USD → display` pipeline with `toDisplay`. Remove `toUsdClient` export once all callers migrated.
7. **`build-inputs.ts`** — Replace `toUsdSync * eurRate` with `toDisplay(amount, currency, "EUR", liveRates)`.
8. **`RealEstateDetail`** — Already uses `formatMoney` (display-only); no change needed once `formatMoney` is updated in step 6.
9. **Backfill** — Regenerate all historical snapshots to populate `native_breakdown`.
10. **Cleanup** — Drop `total_value` USD column and all USD-bridge code after full rollout.

---

## 5. Round-Trip Risk Flags

| Risk | Severity | Notes |
|---|---|---|
| `amount / rate * rate ≠ amount` | Low | IEEE 754 rounding; acceptable for display but accumulates across thousands of daily rows if stored repeatedly |
| Double bridge `native → USD → EUR` | Medium | Two division operations; a €100 asset may store as $112.36 then read back as €99.98. No financial consequence for display, but will show phantom P&L in audit trails. |
| Stale fallback rates in `money.ts` | Medium | Hard-coded `{ EUR: 0.89, GBP: 0.76 }` at module level will be wrong after any meaningful rate movement; causes flash and incorrect pre-load display values. Should be replaced with a loading skeleton or suspense boundary. |
| Historical rate availability gaps | Low-Medium | `getHistoricalUsdRates` may return `null` for weekends/holidays. `rateAt` currently falls back silently to `undefined`, which produces `NaN` contributions. Should be explicit about fallback strategy (nearest business day, last known). |
| FX rate source single-point-of-failure | Low | Both live and historical rates come from one external provider. A fetch failure causes the live tip to vanish or snapshot writes to store 0. Consider caching last-known rates in DB. |

---

## 6. Migration Note

The current architecture is internally consistent: **everything is USD in the database; display conversion is always the last step**. The main correctness gap is the property detail page diverging from the chart because it converts at live rate rather than historical. No financial data is lost or corrupted; the issue is presentation consistency.

A migration to native-currency storage is safe if steps 1–10 above are followed in order. The most critical invariant to preserve is: **a snapshot row must carry enough information to reconstruct the total in any display currency without hitting an external API** — meaning either storing the native breakdown + the per-date rates (preferred), or keeping the USD total + per-date rates (current).
