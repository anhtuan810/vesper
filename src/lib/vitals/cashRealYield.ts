import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { getCountryDefaults } from '@/lib/vitals/country-defaults';
import type { Band, Snapshot, VitalScope, VitalUser } from './types';

export const scope: VitalScope = 'liquid';

export interface CashRealYieldValue {
  cashEur: number;
  cashPctOfNw: number;
  savingsRatePct: number;
  inflationDragPct: number;
  box3TaxPct: number;
  realYieldPct: number;
  annualErosionEur: number;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  const netWorth = computeNetWorth(assets);
  if (netWorth <= 0) return false;
  const cashEur = sumCash(assets);
  return (cashEur / netWorth) * 100 > 5;
}

export function compute(
  user: VitalUser,
  assets: Asset[],
  _snapshots?: Snapshot[],
): CashRealYieldValue {
  const defaults = getCountryDefaults(user.country);
  const netWorth = computeNetWorth(assets);
  const cashEur = sumCash(assets);

  const cashPctOfNw = netWorth > 0 ? (cashEur / netWorth) * 100 : 0;
  const savingsRatePct = defaults.bestSavingsRatePct;
  const inflationDragPct = defaults.inflationPct;
  const box3TaxPct = defaults.wealthTaxBox3PctApprox;
  const realYieldPct = savingsRatePct - inflationDragPct - box3TaxPct;
  const annualErosionEur = cashEur * (realYieldPct / 100);

  return {
    cashEur,
    cashPctOfNw,
    savingsRatePct,
    inflationDragPct,
    box3TaxPct,
    realYieldPct,
    annualErosionEur,
  };
}

export function band(value: CashRealYieldValue): Band {
  if (value.realYieldPct < -2) return 'red';
  if (value.realYieldPct < 0) return 'amber';
  return 'green';
}

function sumCash(assets: Asset[]): number {
  return assets.filter(a => a.type === 'cash').reduce((s, a) => s + a.value, 0);
}

function computeNetWorth(assets: Asset[]): number {
  return assets.reduce((s, a) => {
    if (a.type === 'real_estate') return s + Math.max(0, a.value - computeCurrentBalance(a));
    return s + a.value;
  }, 0);
}
