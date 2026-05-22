// One-off sanity-check script — do not commit.
// Run: npx tsx scratch-vitals.ts

import { computeAllVitals } from './src/lib/vitals/index.js';
import * as realGrowth from './src/lib/vitals/realGrowth.js';
import type { Asset } from './src/lib/supabase.js';
import type { Snapshot, VitalUser } from './src/lib/vitals/types.js';

const user: VitalUser = { country: 'NL' };

// Sample portfolio — all values in EUR
const assets: Asset[] = [
  {
    id: '1', user_id: 'u', name: 'Main residence', type: 'real_estate',
    value: 550_000, currency: 'EUR',
    mortgage_balance: 310_000,
    mortgage_balance_recorded_at: '2024-01-01',
    mortgage_rate: 3.8,
    monthly_payment: 1_650,
    mortgage_type: 'annuity',
    created_at: '2020-01-01', updated_at: '2025-01-01',
  },
  {
    id: '2', user_id: 'u', name: 'VWRL ETF', type: 'etf',
    value: 95_000, currency: 'EUR', symbol: 'VWRL.AS',
    created_at: '2021-06-01', updated_at: '2025-01-01',
  },
  {
    id: '3', user_id: 'u', name: 'Bitcoin', type: 'crypto',
    value: 45_000, currency: 'EUR', symbol: 'BTC-EUR',
    created_at: '2022-03-01', updated_at: '2025-01-01',
  },
  {
    id: '4', user_id: 'u', name: 'ING savings', type: 'cash',
    value: 55_000, currency: 'EUR',
    created_at: '2019-01-01', updated_at: '2025-01-01',
  },
  {
    id: '5', user_id: 'u', name: 'ABN pension', type: 'pension',
    value: 38_000, currency: 'EUR',
    created_at: '2018-01-01', updated_at: '2025-01-01',
  },
];

// Net worth ≈ (550k − 310k) + 95k + 45k + 55k + 38k = 473k

// Synthetic monthly snapshots for 36 months (3 years)
const today = new Date('2026-05-22');
const snapshots: Snapshot[] = [];
for (let i = 36; i >= 0; i--) {
  const d = new Date(today);
  d.setMonth(d.getMonth() - i);
  const date = d.toISOString().slice(0, 10);
  // Simulated net worth growing ~7% per year from 390k
  const yearsAgo = i / 12;
  const nw = Math.round(390_000 * Math.pow(1.07, 3 - yearsAgo));
  // Rough breakdown by type (as equity)
  const re = Math.round(nw * 0.50);
  const etf = Math.round(nw * 0.21);
  const crypto = Math.round(nw * 0.09);
  const cash = Math.round(nw * 0.12);
  const pension = nw - re - etf - crypto - cash;
  snapshots.push({
    date,
    total_value: nw,
    breakdown: { real_estate: re, etf, crypto, cash, pension },
  });
}

const results = computeAllVitals(user, assets, snapshots);

for (const r of results) {
  console.log(`\n── ${r.key} [${r.applies ? r.band.toUpperCase() : 'dormant'}] ──`);
  if (!r.applies) {
    console.log('  (does not apply)');
  } else {
    console.log(JSON.stringify(r.value, null, 2).replace(/^/gm, '  '));
  }
}

// ── realGrowth guard cases ─────────────────────────────────────────────────────

function makeDailySeries(
  startDaysAgo: number,
  startValue: number,
  endValue: number,
  count: number,
): Snapshot[] {
  const snaps: Snapshot[] = [];
  const now = Date.now();
  const totalDays = startDaysAgo;
  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);
    const daysAgo = Math.round(startDaysAgo - frac * totalDays);
    const d = new Date(now - daysAgo * 24 * 60 * 60 * 1000);
    const total_value = Math.round(startValue + frac * (endValue - startValue));
    snaps.push({ date: d.toISOString().slice(0, 10), total_value, breakdown: null });
  }
  // dedupe by date, keep last
  const byDate = new Map<string, Snapshot>();
  for (const s of snaps) byDate.set(s.date, s);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const guardAssets: Asset[] = [
  {
    id: 'g1', user_id: 'u', name: 'Fund', type: 'etf',
    value: 100_000, currency: 'EUR', symbol: 'VWRL.AS',
    created_at: '2020-01-01', updated_at: '2026-01-01',
  },
];

console.log('\n\n══════════════════════════════════════════');
console.log('  realGrowth guard cases');
console.log('══════════════════════════════════════════');

// Case (a): 13-month daily series, baseline ~85% of current → applies true, sensible %
// 395 daily points spanning 395 days; baseline (≈365 days ago) value = 85_000, current = 100_000
// Expected nominal12moPct ≈ +17.6%
const seriesA = makeDailySeries(395, 85_000, 100_000, 395);
const appliesA = realGrowth.applies({ country: 'NL' }, guardAssets, seriesA);
const valueA = appliesA ? realGrowth.compute({ country: 'NL' }, guardAssets, seriesA) : null;
console.log('\nCase (a) — 13-month series, baseline ≈ 85% of current:');
console.log(`  applies: ${appliesA}`);
if (valueA) {
  console.log(`  nominal12moPct: ${valueA.nominal12moPct.toFixed(2)}%`);
  console.log(`  real12moPct:    ${valueA.real12moPct.toFixed(2)}%`);
  console.log(`  band:           ${realGrowth.band(valueA)}`);
  console.log(`  series points:  ${valueA.series.length}`);
}

// Case (b1): only 30 days of history → baseline age < 330 days → applies false
const seriesB1 = makeDailySeries(30, 90_000, 100_000, 30);
const appliesB1 = realGrowth.applies({ country: 'NL' }, guardAssets, seriesB1);
console.log('\nCase (b1) — 30-day series (baseline too young):');
console.log(`  applies: ${appliesB1}  (expected: false)`);

// Case (b2): 13-month series but baseline is only 5% of current → floor check → applies false
const seriesB2 = makeDailySeries(395, 5_000, 100_000, 395);
const appliesB2 = realGrowth.applies({ country: 'NL' }, guardAssets, seriesB2);
console.log('\nCase (b2) — 13-month series, baseline ≈ 5% of current:');
console.log(`  applies: ${appliesB2}  (expected: false)`);
