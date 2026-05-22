export * from './types';

import type { Asset } from '@/lib/supabase';
import type { Band, Snapshot, VitalKey, VitalScope, VitalUser } from './types';

import * as concentration from './concentration';
import * as realAssetWeight from './realAssetWeight';
import * as liquidityPosture from './liquidityPosture';
import * as leverage from './leverage';
import * as drawdown from './drawdown';
import * as cashRealYield from './cashRealYield';
import * as realGrowth from './realGrowth';

export type { ConcentrationValue } from './concentration';
export type { RealAssetWeightValue } from './realAssetWeight';
export type { LiquidityPostureValue } from './liquidityPosture';
export type { LeverageValue } from './leverage';
export type { DrawdownValue } from './drawdown';
export type { CashRealYieldValue } from './cashRealYield';
export type { RealGrowthValue } from './realGrowth';

export interface VitalResult {
  key: VitalKey;
  applies: boolean;
  value: unknown;
  band: Band;
  scope: VitalScope;
}

// Generic helper keeps TypeScript happy: T is inferred per module, so
// mod.band receives exactly the type that mod.compute produced.
function runVital<T>(
  key: VitalKey,
  mod: {
    scope: VitalScope;
    applies: (u: VitalUser, a: Asset[], s?: Snapshot[]) => boolean;
    compute: (u: VitalUser, a: Asset[], s?: Snapshot[]) => T;
    band: (v: T) => Band;
  },
  user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): VitalResult {
  const doesApply = mod.applies(user, assets, snapshots);
  if (!doesApply) return { key, applies: false, value: null, band: 'green', scope: mod.scope };
  const value = mod.compute(user, assets, snapshots);
  return { key, applies: true, value, band: mod.band(value), scope: mod.scope };
}

export function computeAllVitals(
  user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): VitalResult[] {
  return [
    runVital('concentration',    concentration,    user, assets, snapshots),
    runVital('realAssetWeight',  realAssetWeight,  user, assets, snapshots),
    runVital('liquidityPosture', liquidityPosture, user, assets, snapshots),
    runVital('leverage',         leverage,         user, assets, snapshots),
    runVital('drawdown',         drawdown,         user, assets, snapshots),
    runVital('cashRealYield',    cashRealYield,    user, assets, snapshots),
    runVital('realGrowth',       realGrowth,       user, assets, snapshots),
  ];
}
