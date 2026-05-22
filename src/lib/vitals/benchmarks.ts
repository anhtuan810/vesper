/*
 * METHODOLOGY — two incompatible measurement bases (V1 known limitation)
 *
 * NL_PERCENTILES and EU_PERCENTILES come from the ECB Household Finance and
 * Consumption Survey (HFCS).  The HFCS unit is NET WEALTH PER HOUSEHOLD.
 * When we compare a user's net worth against these tables we treat the user
 * as one household, which is the correct frame for most solo/couple users.
 *
 * WORLD_PERCENTILES come from the UBS Global Wealth Report.  The UBS unit is
 * WEALTH PER ADULT (individual), not per household.  A two-adult household
 * compared against this table effectively reports the combined household
 * wealth against a per-adult benchmark, which slightly overstates the user's
 * global rank.  The UBS series is the only widely cited cross-country wealth
 * comparison available at this granularity, so we use it as the "honest
 * global frame" while documenting the basis mismatch.
 *
 * A future iteration may reconcile to a single basis (per-adult throughout,
 * or household-equivalised world figures).  Until then: NL and EU percentiles
 * are household-based; WORLD percentile is per-adult.  Do not treat the three
 * columns as a consistent distribution — they are three independent scales.
 */

/*
 * SOURCES — figures require annual refresh.
 *
 * ECB HFCS wave 2021, statistical tables published July 2023.
 *   Source of NL and EU anchor values; quintile cut-offs from wave 2 used
 *   for intermediate EU brackets.
 *   ecb.europa.eu/pub/economic-research/research-networks/html/researcher_hfcn.en.html
 *
 * CBS Netherlands — Vermogen van huishoudens, 2021 and 2023 releases.
 *   NL median household net wealth €87,300 (2021).
 *   Top 10% of Dutch households hold 56% of wealth; top 1% hold ~23% (CBS 2023).
 *   cbs.nl/nl-nl/cijfers/detail/85016NED
 *
 * UBS Global Wealth Report 2025.
 *   World median wealth per adult ~$8,654; upper-middle tier ($100k–$1M) covers
 *   ~628 M adults (~11.6%); top 1.1% (~60 M adults) hold wealth above $1 M.
 *   All USD figures converted to EUR using USD_PER_EUR (see constant below).
 *   ubs.com/global/en/wealth-management/insights/global-wealth-report.html
 */

export type PercentileTable = Record<number, number>;

// ---------------------------------------------------------------------------
// USD → EUR conversion used for world figures.
// Rate: 1 EUR ≈ 1.08 USD (mid-2024 average).  Review annually alongside the
// UBS report refresh.
// ---------------------------------------------------------------------------
const USD_PER_EUR = 1.08;

// ---------------------------------------------------------------------------
// Netherlands — ECB HFCS 2021 + CBS
// Unit: net wealth per HOUSEHOLD (see methodology note above).
// Anchors: median €87,300 (CBS 2021); 90th in €550–650k range; 99th in the
// low single-digit millions (consistent with top-1% holding ~23% of NL wealth,
// CBS 2023).  Intermediate brackets interpolated to produce a smooth curve.
// ---------------------------------------------------------------------------
export const NL_PERCENTILES: PercentileTable = {
  10:    1_500,      // bottom decile; many young/negative-equity households near zero
  25:   14_000,
  50:   87_300,      // CBS 2021 median — primary anchor
  75:  242_000,
  90:  590_000,      // within the sourced 550–650k range
  95: 1_050_000,
  99: 2_500_000,     // low single-digit millions; consistent with top-1%-holds-23%
};

// ---------------------------------------------------------------------------
// European Union — ECB HFCS 2021
// Unit: net wealth per HOUSEHOLD (see methodology note above).
// Anchors: median €109,000 (HFCS 2021); 90th €496,000 (HFCS); 96th ≈ €1M
// (HFCS-derived, Springer 2025); 99th ≈ €2M+.
// Wave-2 quintile cut-offs (20th/40th/60th/80th = €7,500/€60,500/€154,300/
// €308,900) used to calibrate the intermediate brackets.
// ---------------------------------------------------------------------------
export const EU_PERCENTILES: PercentileTable = {
  10:    1_000,      // bottom decile; negative or near-zero in parts of Southern Europe
  25:   21_000,      // interpolated from wave-2 quintile cut-offs (20th = €7,500, 40th = €60,500)
  50:  109_000,      // HFCS 2021 euro-area median — primary anchor
  75:  270_000,      // interpolated from wave-2 cut-offs (60th = €154,300, 80th = €308,900)
  90:  496_000,      // HFCS direct anchor
  95:  865_000,      // HFCS-derived; midpoint of the sourced 830–900k range
  99: 2_100_000,     // HFCS-derived
};

// ---------------------------------------------------------------------------
// World — UBS Global Wealth Report 2025
// Unit: wealth per ADULT (see methodology note above).
// All values are USD figures from UBS divided by USD_PER_EUR.
//
// Tier boundaries from UBS 2025:
//   Bottom (<$10k):    53% of adults  → bottom tier ends at ~53rd percentile
//   Middle ($10k–$100k): 34%          → middle tier ends at ~87th percentile
//   Upper-middle ($100k–$1M): 11.6%   → upper-middle ends at ~98.6th percentile
//   Top (>$1M):         1.1–1.6%      → 99th percentile ≈ $1,050,000
//
// The 99th-percentile threshold of $1,050,000 (~€972k) is the UBS top-1%
// entry point.  The old figure of €940k was below the sourced threshold.
// ---------------------------------------------------------------------------
export const WORLD_PERCENTILES: PercentileTable = {
  10:       926,     // ≈ $1,000 / USD_PER_EUR; deep within bottom tier
  25:     2_037,     // ≈ $2,200 / USD_PER_EUR; mid lower band
  50:     8_013,     // = $8,654 UBS median / USD_PER_EUR
  75:    63_000,     // ≈ $68,000 / USD_PER_EUR; upper end of $10k–$100k middle tier
  90:   303_000,     // ≈ $327,000 / USD_PER_EUR; lower upper-middle tier
  95:   652_000,     // ≈ $704,000 / USD_PER_EUR; upper upper-middle tier
  99:   972_000,     // = $1,050,000 / USD_PER_EUR; UBS top-1% entry threshold
};

// World top-1% threshold in EUR (= $1,050,000 / USD_PER_EUR).
// Used for display; the old value of €940k was below the sourced UBS figure.
export const WORLD_TOP_1_PCT_EUR: number = Math.round(1_050_000 / USD_PER_EUR);

// ---------------------------------------------------------------------------
// Ancillary constants
// ---------------------------------------------------------------------------

// NL average loan-to-value; sourced from DNB mortgage market statistics.
export const NL_AVG_LTV_PCT: number = 52;

// Median EU homeowner's property equity as a fraction of their net worth.
// The ECB HFCS notes that ~50% of AGGREGATE euro-area household wealth sits in
// the main residence (across all households, including ~38% renters who hold
// zero housing equity).  For the HOMEOWNER subset specifically, the figure is
// higher — this constant reflects the median homeowner household, not the
// aggregate.  63% is consistent with HFCS cross-tabulations for owner-occupier
// households and is used by realAssetWeight.ts as a benchmark mid-point.
export const EU_HOMEOWNER_RE_WEIGHT_PCT: number = 63;

// Confirmed: UBS 2025 reports ~5.36 billion adults globally; rounded to 5.4.
export const WORLD_ADULTS_BN: number = 5.4;

export const EU_COUNTRIES: number = 27;
