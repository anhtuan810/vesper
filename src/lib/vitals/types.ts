export type Band = 'green' | 'amber' | 'red';
export type VitalScope = 'liquid' | 'house' | 'both';

export type VitalKey =
  | 'concentration'
  | 'realAssetWeight'
  | 'liquidityPosture'
  | 'leverage'
  | 'drawdown'
  | 'cashRealYield'
  | 'realGrowth';

// Minimal user shape needed by vital computations — a subset of UserRow
export interface VitalUser {
  country?: string | null;
}

// Snapshot row from the snapshots table
export interface Snapshot {
  date: string;         // "YYYY-MM-DD"
  total_value: number;  // net worth in USD (as written by writeSnapshot)
  breakdown: Record<string, number> | null; // keyed by asset type, values in USD
}
