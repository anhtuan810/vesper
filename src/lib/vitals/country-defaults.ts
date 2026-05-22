export type CountryDefaults = {
  inflationPct: number;
  bestSavingsRatePct: number;
  ecbDepositRatePct: number;
  wealthTaxBox3PctApprox: number;
  mortgageRateRangePct: [number, number];
  liquidBufferTargetPct: number;
};

const NL_DEFAULTS: CountryDefaults = {
  inflationPct: 3.7,
  bestSavingsRatePct: 3.4,
  ecbDepositRatePct: 3.0,
  wealthTaxBox3PctApprox: 1.0,
  mortgageRateRangePct: [3.51, 4.79],
  liquidBufferTargetPct: 15,
};

// V1: NL only — signature accepts country for forward-compatibility with DE/UK
export function getCountryDefaults(country?: string | null): CountryDefaults {
  void country;
  return NL_DEFAULTS;
}
