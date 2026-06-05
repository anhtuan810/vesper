import type { Asset } from '@/lib/supabase';
import { computeCurrentBalance } from '@/lib/mortgage';
import { isIncomePension } from '@/lib/pension';
import type { Band, Snapshot, VitalScope, VitalUser } from './types';

export const scope: VitalScope = 'house';

export interface LeverageValue {
  ltvPct: number;
  debtToAssetsPct: number;
  mortgageRate: number;
  portfolioYield: number;
  trend: Array<{ date: string; ltv: number }>;
}

export function applies(_user: VitalUser, assets: Asset[], _snapshots?: Snapshot[]): boolean {
  return assets.some(
    a => a.type === 'real_estate' && a.mortgage_balance != null && a.mortgage_balance > 0,
  );
}

export function compute(
  _user: VitalUser,
  assets: Asset[],
  snapshots?: Snapshot[],
): LeverageValue {
  const reAssets = assets.filter(a => a.type === 'real_estate');
  const totalPropertyValue = reAssets.reduce((s, a) => s + a.value, 0);
  const totalDebt = reAssets.reduce((s, a) => s + computeCurrentBalance(a), 0);
  // Income pensions (db/state, value null) own no balance — keep them out of the
  // debt-to-assets denominator so a stray value can't dilute leverage. Yield calc
  // (bonds/cash only) is untouched and already ignores them.
  const grossAssets = assets.reduce((s, a) => (isIncomePension(a) ? s : s + a.value), 0);

  const ltvPct = totalPropertyValue > 0 ? (totalDebt / totalPropertyValue) * 100 : 0;
  const debtToAssetsPct = grossAssets > 0 ? (totalDebt / grossAssets) * 100 : 0;
  const mortgageRate = weightedMortgageRate(reAssets);
  const yld = computePortfolioYield(assets);

  const trend = buildLtvTrend(snapshots ?? [], totalPropertyValue);

  return { ltvPct, debtToAssetsPct, mortgageRate, portfolioYield: yld, trend };
}

export function band(value: LeverageValue): Band {
  if (value.ltvPct > 75) return 'red';
  if (value.ltvPct > 50) return 'amber';
  return 'green';
}

function weightedMortgageRate(reAssets: Asset[]): number {
  let totalBalance = 0;
  let weightedRate = 0;
  for (const a of reAssets) {
    if (a.type !== 'real_estate') continue;
    const balance = computeCurrentBalance(a);
    if (balance > 0 && a.mortgage_rate != null) {
      weightedRate += a.mortgage_rate * balance;
      totalBalance += balance;
    }
  }
  return totalBalance > 0 ? weightedRate / totalBalance : 0;
}

function computePortfolioYield(assets: Asset[]): number {
  let totalValue = 0;
  let weightedYield = 0;
  for (const a of assets) {
    if (a.type === 'bonds' && a.coupon_rate != null) {
      weightedYield += a.coupon_rate * a.value;
      totalValue += a.value;
    } else if (a.type === 'cash' && a.mortgage_rate != null) {
      // mortgage_rate is repurposed as interest_rate for cash in StaticAsset
      weightedYield += a.mortgage_rate * a.value;
      totalValue += a.value;
    }
  }
  return totalValue > 0 ? weightedYield / totalValue : 0;
}

// Reconstruct historical LTV from snapshots.
// Since property value is static (user-updated only), we treat it as constant
// and derive historical mortgage balance = totalPropertyValue - snap.breakdown.real_estate.
function buildLtvTrend(
  snapshots: Snapshot[],
  totalPropertyValue: number,
): Array<{ date: string; ltv: number }> {
  if (totalPropertyValue <= 0 || snapshots.length === 0) return [];

  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 12);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  // One snapshot per month (last date in each YYYY-MM window)
  const byMonth = new Map<string, Snapshot>();
  for (const snap of snapshots) {
    if (snap.date < cutoffStr) continue;
    const monthKey = snap.date.slice(0, 7);
    const existing = byMonth.get(monthKey);
    if (!existing || snap.date > existing.date) byMonth.set(monthKey, snap);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(snap => {
      const reEquity = snap.breakdown?.['real_estate'] ?? 0;
      const historicalDebt = Math.max(0, totalPropertyValue - reEquity);
      return { date: snap.date, ltv: (historicalDebt / totalPropertyValue) * 100 };
    });
}
