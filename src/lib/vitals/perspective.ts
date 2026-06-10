// country and birthYear are reserved for age-cohort and DE/UK support
import {
  NL_PERCENTILES,
  EU_PERCENTILES,
  WORLD_PERCENTILES,
  WORLD_TOP_1_PCT_EUR,
  type PercentileTable,
} from "./benchmarks";

export type PerspectiveRow = {
  region: "NL" | "EU" | "WORLD";
  label: string;       // 'Netherlands' | 'European Union' | 'Worldwide'
  sublabel: string;    // 'your country' | '27 countries' | '5.4 bn adults'
  percentile: number;  // 0-100, one decimal
  contextLine: string;
};

export type Perspective = {
  netWorthEur: number;
  rows: PerspectiveRow[];  // always [NL, EU, WORLD] in that order
  trajectory: { pointsThisYear: number; region: "NL" } | null;
};

function interpolatePercentile(table: PercentileTable, valueEur: number): number {
  const entries = (Object.entries(table) as [string, number][])
    .map(([k, v]) => ({ pct: Number(k), eur: v }))
    .sort((a, b) => a.pct - b.pct);

  // Never return an impossible 100th percentile — applied to every branch
  // below, not just the above-last-bracket extrapolation.
  const cap = (pct: number) => Math.round(Math.min(99.9, pct) * 10) / 10;

  // Below the lowest bracket → interpolate toward 0, clamp to [0, entries[0].pct]
  if (valueEur <= entries[0].eur) {
    if (entries[0].eur <= 0) return 0;
    const ratio = Math.max(0, valueEur / entries[0].eur);
    return cap(ratio * entries[0].pct);
  }

  // Above the 99th bracket → extrapolate but do not exceed 99.9
  const last = entries[entries.length - 1];
  if (valueEur >= last.eur) {
    const prev = entries[entries.length - 2];
    const ratio = (valueEur - prev.eur) / (last.eur - prev.eur);
    const pct = prev.pct + ratio * (last.pct - prev.pct);
    return cap(pct);
  }

  // Linear interpolation between bracketing thresholds
  for (let i = 0; i < entries.length - 1; i++) {
    const lo = entries[i];
    const hi = entries[i + 1];
    if (valueEur >= lo.eur && valueEur < hi.eur) {
      const ratio = (valueEur - lo.eur) / (hi.eur - lo.eur);
      return cap(lo.pct + ratio * (hi.pct - lo.pct));
    }
  }

  return 0;
}

export function computePerspective(
  netWorthEur: number,
  country: string | null | undefined,
  birthYear: number | null | undefined,
  netWorth12moAgoEur?: number | null
): Perspective {
  // country and birthYear reserved for age-cohort and DE/UK support in future versions
  void country;
  void birthYear;

  const nlPct = interpolatePercentile(NL_PERCENTILES, netWorthEur);
  const euPct = interpolatePercentile(EU_PERCENTILES, netWorthEur);
  const worldPct = interpolatePercentile(WORLD_PERCENTILES, netWorthEur);

  const top1Label = `~€${Math.round(WORLD_TOP_1_PCT_EUR / 1_000)}k`;
  const worldContextLine = netWorthEur >= WORLD_TOP_1_PCT_EUR
    ? `above the world top 1% threshold (${top1Label})`
    : `below the world top 1% threshold (${top1Label})`;

  const rows: PerspectiveRow[] = [
    {
      region: "NL",
      label: "Netherlands",
      sublabel: "your country",
      percentile: nlPct,
      contextLine: "comparable to homeowners with paid-down mortgage and modest pension",
    },
    {
      region: "EU",
      label: "European Union",
      sublabel: "27 countries",
      percentile: euPct,
      contextLine: "above 9 in 10 households across the bloc",
    },
    {
      region: "WORLD",
      label: "Worldwide",
      sublabel: "5.4 bn adults",
      percentile: worldPct,
      contextLine: worldContextLine,
    },
  ];

  let trajectory: Perspective["trajectory"] = null;
  if (netWorth12moAgoEur != null && netWorth12moAgoEur > 0) {
    const pastNlPct = interpolatePercentile(NL_PERCENTILES, netWorth12moAgoEur);
    trajectory = {
      pointsThisYear: Math.round(nlPct - pastNlPct),
      region: "NL",
    };
  }

  return { netWorthEur, rows, trajectory };
}
