import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { isIncomePension, isCapitalPension } from '@/lib/pension';
import { getCountryDefaults } from '@/lib/vitals/country-defaults';
import type { Band, Snapshot, VitalScope, VitalUser } from './types';

export const scope: VitalScope = 'liquid';

export interface LiquidityPostureValue {
  deployable1wPct: number;
  sameDayPct: number;
  oneWeekPct: number;
  oneMonthPct: number;
  sixMonthPlusPct: number;
  lockedPct: number;
  liquidBufferPct: number;
  // EUR-normalized euro figures for the locked tier, so the card's deterministic
  // context can name the locked driver. lockedPensionEur is the capital-pension
  // portion of the locked tier; both come from the same eurValue sum, never invented.
  lockedEur: number;
  lockedPensionEur: number;
  // True when there is nothing to assess — no assets, or zero/negative net worth.
  // The card renders a neutral "add assets" state rather than a 0% liquidity alarm;
  // an illiquid-but-populated portfolio (e.g. property-only) is NOT insufficient and
  // keeps its real (possibly red) reading.
  insufficient: boolean;
}

export function applies(_user: VitalUser, _assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return true;
}

export function compute(
  user: VitalUser,
  rawAssets: Asset[],
  _snapshots?: Snapshot[],
): LiquidityPostureValue {
  const { liquidBufferTargetPct } = getCountryDefaults(user.country);
  // Income pensions (db/state) are not owned balances — exclude them from both the
  // bucketed numerator and the net-worth denominator. Capital pensions stay 'locked'.
  const assets = rawAssets.filter(a => !isIncomePension(a));
  const netWorth = computeNetWorth(assets);

  // Empty or thin: no owned assets, or net worth that nets to zero/negative. There's
  // nothing to bucket, so flag insufficient and let the card show a neutral state
  // instead of a misleading 0%-deployable "could force selling" alarm.
  if (assets.length === 0 || netWorth <= 0) {
    return {
      deployable1wPct: 0,
      sameDayPct: 0,
      oneWeekPct: 0,
      oneMonthPct: 0,
      sixMonthPlusPct: 0,
      lockedPct: 0,
      liquidBufferPct: liquidBufferTargetPct,
      lockedEur: 0,
      lockedPensionEur: 0,
      insufficient: true,
    };
  }

  let sameDay = 0;
  let oneWeek = 0;
  let oneMonth = 0;
  let sixMonthPlus = 0;
  let locked = 0;
  let lockedPension = 0; // capital-pension portion of the locked tier (EUR)

  for (const a of assets) {
    const contribution = assetContribution(a);
    const tier = liquidityTier(a.type);
    switch (tier) {
      case 'same-day':    sameDay += contribution; break;
      case '1w':          oneWeek += contribution; break;
      case '1mo':         oneMonth += contribution; break;
      case '6mo+':        sixMonthPlus += contribution; break;
      case 'locked':      locked += contribution; break;
    }
    if (tier === 'locked' && isCapitalPension(a)) lockedPension += contribution;
  }

  const pct = (v: number) => (v / netWorth) * 100;

  return {
    sameDayPct: pct(sameDay),
    oneWeekPct: pct(oneWeek),
    oneMonthPct: pct(oneMonth),
    sixMonthPlusPct: pct(sixMonthPlus),
    lockedPct: pct(locked),
    deployable1wPct: pct(sameDay + oneWeek),
    liquidBufferPct: liquidBufferTargetPct,
    lockedEur: locked,
    lockedPensionEur: lockedPension,
    insufficient: false,
  };
}

export function band(value: LiquidityPostureValue): Band {
  // Nothing to assess yet → neutral (no alarm), not a red liquidity warning.
  if (value.insufficient) return 'green';
  if (value.deployable1wPct < value.liquidBufferPct) return 'red';
  return 'green';
}

type LiquidityTier = 'same-day' | '1w' | '1mo' | '6mo+' | 'locked';

function liquidityTier(type: Asset['type']): LiquidityTier {
  switch (type) {
    case 'cash':         return 'same-day';
    case 'stocks':
    case 'etf':
    case 'crypto':
    case 'gold':         return '1w';
    case 'bonds':        return '1mo';
    case 'real_estate':  return '6mo+';
    case 'pension':      return 'locked';
    default:             return '6mo+'; // conservative for 'other'
  }
}

// For real_estate use equity (accessible after selling and repaying mortgage).
// All other assets are unlevered; use full value.
function assetContribution(a: Asset): number {
  if (a.type === 'real_estate') return Math.max(0, a.value - computeCurrentBalance(a));
  return a.value;
}

function computeNetWorth(assets: Asset[]): number {
  return assets.reduce((s, a) => s + assetContribution(a), 0);
}
