import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchHistoricalSeries } from "@/lib/prices";
import {
  DIARY_MARKET_INDICES,
  MARKET_MOVE_LOOKBACK_DAYS,
  MARKET_MOVE_THRESHOLD_PCT,
  MARKET_MOVE_WINDOW_TRADING_DAYS,
} from "@/lib/constants";

export interface DiaryMarketMove {
  date: string; // YYYY-MM-DD
  index_symbol: string;
  index_label: string;
  pct_change: number;
}

interface MoveRow {
  date: string;
  pct_change: number;
}

const DAY_MS = 86_400_000;

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return toDateStr(d);
}

// Computes signed daily % change vs the previous trading close, for each point
// after the first (which has no predecessor in the series).
function computeDailyPctChanges(series: { date: string; price: number }[]): MoveRow[] {
  const out: MoveRow[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].price;
    const cur = series[i].price;
    if (!prev) continue;
    out.push({ date: series[i].date, pct_change: ((cur - prev) / prev) * 100 });
  }
  return out;
}

async function ensureCachedMoves(
  supabase: SupabaseClient,
  symbol: string,
  spanFrom: string,
  spanTo: string,
): Promise<MoveRow[]> {
  const { data: cached } = await supabase
    .from("market_moves")
    .select("date, pct_change")
    .eq("index_symbol", symbol)
    .gte("date", spanFrom)
    .lte("date", spanTo)
    .order("date", { ascending: true });

  const cachedRows = (cached ?? []) as MoveRow[];
  const cachedDates = new Set(cachedRows.map((r) => r.date));

  // Cheap coverage check: do we have a row at (or near) both ends of the span?
  // A trading calendar has gaps (weekends/holidays), so require at least one
  // cached row within 5 days of each end rather than an exact-date match.
  const hasNear = (target: string) =>
    cachedRows.some((r) => Math.abs(new Date(r.date).getTime() - new Date(target).getTime()) <= 5 * DAY_MS);

  if (cachedRows.length > 0 && hasNear(spanFrom) && hasNear(spanTo)) {
    return cachedRows;
  }

  // Need a wider series than just the move dates: the first day of the span has
  // no predecessor close in [spanFrom, spanTo], so fetch one extra trading week back.
  const fetchFrom = addDays(spanFrom, -7);
  const series = await fetchHistoricalSeries(symbol, fetchFrom, spanTo);
  if (!series || series.length < 2) return cachedRows;

  const computed = computeDailyPctChanges(series).filter((r) => r.date >= spanFrom && r.date <= spanTo);
  if (computed.length === 0) return cachedRows;

  await supabase
    .from("market_moves")
    .upsert(
      computed.map((r) => ({ index_symbol: symbol, date: r.date, pct_change: r.pct_change })),
      { onConflict: "index_symbol,date" },
    );

  const merged = new Map<string, MoveRow>();
  for (const r of cachedRows) merged.set(r.date, r);
  for (const r of computed) merged.set(r.date, r);
  for (const d of cachedDates) merged.set(d, merged.get(d)!);
  return [...merged.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// Index of the nearest trading date <= target, else the nearest >= target.
function anchorIndex(tradingDates: string[], target: string): number | null {
  if (tradingDates.length === 0) return null;
  let lastLE = -1;
  for (let i = 0; i < tradingDates.length; i++) {
    if (tradingDates[i] <= target) lastLE = i;
    else break;
  }
  if (lastLE >= 0) return lastLE;
  return 0; // nothing <= target: fall back to the earliest (nearest >=)
}

export async function getDiaryMarketMoves(userId: string, supabase: SupabaseClient): Promise<DiaryMarketMove[]> {
  const lookbackCutoff = toDateStr(new Date(Date.now() - MARKET_MOVE_LOOKBACK_DAYS * DAY_MS));

  const { data: mutationRows } = await supabase
    .from("mutations")
    .select("occurred_at, recorded_at")
    .eq("user_id", userId);

  const mutationDates = [...new Set(
    (mutationRows ?? [])
      .map((m: { occurred_at: string | null; recorded_at: string }) => m.occurred_at ?? m.recorded_at)
      .filter((d: string | null): d is string => !!d && d >= lookbackCutoff),
  )].sort();

  if (mutationDates.length === 0) return [];

  const spanFrom = addDays(mutationDates[0], -7);
  const spanTo = addDays(mutationDates[mutationDates.length - 1], 7);

  // candidates: date -> best (largest |pct_change|) move that day
  const candidates = new Map<string, DiaryMarketMove>();

  for (const { symbol, label } of DIARY_MARKET_INDICES) {
    const rows = await ensureCachedMoves(supabase, symbol, spanFrom, spanTo);
    if (rows.length === 0) continue;

    const tradingDates = rows.map((r) => r.date);
    const byDate = new Map(rows.map((r) => [r.date, r.pct_change]));

    const inWindow = new Set<string>();
    for (const mutationDate of mutationDates) {
      const anchorIdx = anchorIndex(tradingDates, mutationDate);
      if (anchorIdx === null) continue;
      const lo = Math.max(0, anchorIdx - MARKET_MOVE_WINDOW_TRADING_DAYS);
      const hi = Math.min(tradingDates.length - 1, anchorIdx + MARKET_MOVE_WINDOW_TRADING_DAYS);
      for (let i = lo; i <= hi; i++) inWindow.add(tradingDates[i]);
    }

    for (const date of inWindow) {
      const pct = byDate.get(date);
      if (pct == null || Math.abs(pct) < MARKET_MOVE_THRESHOLD_PCT) continue;
      const existing = candidates.get(date);
      if (!existing || Math.abs(pct) > Math.abs(existing.pct_change)) {
        candidates.set(date, { date, index_symbol: symbol, index_label: label, pct_change: pct });
      }
    }
  }

  return [...candidates.values()].sort((a, b) => b.date.localeCompare(a.date));
}
