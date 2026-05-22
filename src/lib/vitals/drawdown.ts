import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import type { Band, Snapshot, VitalScope, VitalUser } from './types';

export const scope: VitalScope = 'liquid';

export interface DrawdownValue {
  equitiesShockEur: number;
  cryptoShockEur: number;
  housingShockEur: number;
  combinedShockEur: number;
  postShockNwEur: number;
  shockPctOfNw: number;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return computeNetWorth(assets) > 0;
}

export function compute(
  _user: VitalUser,
  assets: Asset[],
  _snapshots?: Snapshot[],
): DrawdownValue {
  const netWorth = computeNetWorth(assets);

  let equitiesExposure = 0;
  let cryptoExposure = 0;
  let housingExposure = 0;

  for (const a of assets) {
    switch (a.type) {
      case 'stocks':
      case 'etf':
      case 'gold':
        equitiesExposure += a.value;
        break;
      case 'crypto':
        cryptoExposure += a.value;
        break;
      case 'real_estate':
        // Gross value before mortgage — spec says "gross, before mortgage for housing"
        housingExposure += a.value;
        break;
    }
  }

  const equitiesShockEur = equitiesExposure * 0.30;
  const cryptoShockEur = cryptoExposure * 0.50;
  const housingShockEur = housingExposure * 0.15;
  const combinedShockEur = equitiesShockEur + cryptoShockEur + housingShockEur;
  const postShockNwEur = netWorth - combinedShockEur;
  const shockPctOfNw = netWorth > 0 ? (combinedShockEur / netWorth) * 100 : 0;

  return {
    equitiesShockEur,
    cryptoShockEur,
    housingShockEur,
    combinedShockEur,
    postShockNwEur,
    shockPctOfNw,
  };
}

export function band(value: DrawdownValue): Band {
  if (value.shockPctOfNw > 40) return 'red';
  if (value.shockPctOfNw > 25) return 'amber';
  return 'green';
}

function computeNetWorth(assets: Asset[]): number {
  return assets.reduce((s, a) => {
    if (a.type === 'real_estate') return s + Math.max(0, a.value - computeCurrentBalance(a));
    return s + a.value;
  }, 0);
}
