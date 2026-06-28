// Decision Verdict — the retrospective "was selling here right?" stamp.
//
// For a past sell or reduce of a tradeable position, this reconstructs the stake
// the user SOLD (the units that left the book) at its value then and its value
// now, from real historical prices + FX, and reports the deterministic difference:
//   delta = value-now − value-then
//   delta < 0  → the stake is worth less now → selling SPARED that loss
//   delta > 0  → the stake is worth more now → holding would have GAINED that much
//
// It deliberately reuses the same pure engine the counterfactual uses
// (reconstructPositionSeries) so no model produces the figure. It ignores what
// the freed-up cash did afterwards — the question is narrowly "the stake you let
// go: better or worse to have kept it?", which is the honest, checkable comparison.
//
// Pure read. Writes nothing. Degrades to { ok:false } (the panel shows nothing)
// whenever the inputs can't support an honest number — not a tradeable, too
// recent, no price history, no cost basis.

import { getHistoricalUsdRates, toDisplay } from "@/lib/fx";
import { fetchHistoricalSeries } from "@/lib/prices";
import { reconstructPositionSeries } from "@/lib/scenario/counterfactual";
import type { createServerSupabase } from "@/lib/supabase";

type SupabaseClient = ReturnType<typeof createServerSupabase>;

const TRADEABLE_TYPES = new Set(["stocks", "etf", "crypto"]);
// Below this, "looking back" isn't meaningful yet — the sell is too fresh for a
// verdict to say anything but noise. Gated client-side too, so the call rarely fires.
const MIN_LOOKBACK_DAYS = 21;

const isoDaysAgo = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export interface VerdictData {
  // spared = good call (it fell); missed = sold early (it rose); even = a wash.
  kind: "spared" | "missed" | "even";
  figure: number; // absolute magnitude, expressed in `currency`
  currency: string; // the currency `figure` is in (display currency, or USD fallback)
  lookbackLabel: string; // e.g. "18 months on"
  assetName: string;
  assumptions: string[];
  // The actual figures behind the verdict, so "how this is figured" can show real
  // numbers instead of a generic method note. All money is in `currency`.
  detail: {
    units: number; // the stake that left the book
    valueThen: number; // what those units were worth on the sell date
    valueNow: number; // what those units would be worth today
    soldDate: string; // YYYY-MM-DD of the sell
  };
}

export type VerdictOutcome =
  | { ok: true; data: VerdictData }
  // every not-eligible path collapses to the same shape; the panel renders nothing.
  | { ok: false; reason: string };

interface MutationRow {
  asset_id: string | null;
  action: string | null;
  before_units: number | null;
  after_units: number | null;
  currency: string | null;
  occurred_at: string | null;
  recorded_at: string | null;
  symbol: string | null;
  asset_type: string | null;
  asset_name: string | null;
}

// "18 months on" / "3 weeks on" / "2 years on" — calm, single-unit, no decimals.
// Exported (pure) for the deterministic test suite.
export function lookbackLabel(days: number): string {
  if (days < 60) return `${Math.round(days / 7)} weeks on`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months on`;
  const years = Math.floor(months / 12);
  return `${years} ${years === 1 ? "year" : "years"} on`;
}

// Direction + magnitude from the sold stake's value then vs now (both USD), the
// one piece of judgement in the verdict. delta = now − then:
//   delta < 0 → the stake fell → selling SPARED that much
//   delta > 0 → the stake rose → holding would have GAINED that much
//   |delta| within 1% of the basis (or trivially small) → a wash ("even"), so a
//   rounding-scale wobble isn't dressed up as a verdict either way.
// Pure; exported for the test suite.
export function classifyVerdict(
  thenUsd: number,
  nowUsd: number,
): { kind: VerdictData["kind"]; magnitudeUsd: number } {
  const deltaUsd = nowUsd - thenUsd;
  const evenThreshold = Math.max(thenUsd * 0.01, 1);
  const kind: VerdictData["kind"] =
    Math.abs(deltaUsd) < evenThreshold ? "even" : deltaUsd < 0 ? "spared" : "missed";
  return { kind, magnitudeUsd: Math.abs(deltaUsd) };
}

export async function assembleVerdict(
  supabase: SupabaseClient,
  userId: string,
  mutationId: string,
  displayCurrency: string,
): Promise<VerdictOutcome> {
  const { data: mrow } = await supabase
    .from("mutations")
    .select("asset_id, action, before_units, after_units, currency, occurred_at, recorded_at, symbol, asset_type, asset_name")
    .eq("user_id", userId)
    .eq("id", mutationId)
    .maybeSingle();
  const m = mrow as MutationRow | null;
  if (!m) return { ok: false, reason: "not_found" };

  // Must be a sell or a reduce of a tradeable position with a symbol.
  if (!m.symbol || !TRADEABLE_TYPES.has(m.asset_type ?? "")) return { ok: false, reason: "not_tradeable" };
  const before = typeof m.before_units === "number" ? m.before_units : null;
  const after = m.action === "remove" ? 0 : typeof m.after_units === "number" ? m.after_units : null;
  const isSell = m.action === "remove" || (m.action === "edit" && before != null && after != null && before > after);
  if (!isSell || before == null || after == null) return { ok: false, reason: "not_a_sell" };
  const soldUnits = before - after;
  if (!(soldUnits > 0)) return { ok: false, reason: "no_units" };

  const occurred = (m.occurred_at || m.recorded_at || "").slice(0, 10); // matches the client's mDate (|| , not ??)
  if (!occurred) return { ok: false, reason: "no_date" };
  const daysAgo = Math.floor((Date.now() - Date.parse(occurred)) / 86_400_000);
  if (!(daysAgo >= MIN_LOOKBACK_DAYS)) return { ok: false, reason: "too_recent" };

  const todayStr = new Date().toISOString().slice(0, 10);
  const fromBuffered = isoDaysAgo(daysAgo + 10); // a little runway so a close exists on/before the sell date
  const [priceRaw, fxSeries] = await Promise.all([
    fetchHistoricalSeries(m.symbol, fromBuffered, todayStr),
    getHistoricalUsdRates(fromBuffered, todayStr),
  ]);
  const priceSeries = priceRaw ?? [];
  if (priceSeries.length === 0) return { ok: false, reason: "no_prices" };

  // Value the SOLD stake (constant units) at the sell date and today.
  const { series, assumptions } = reconstructPositionSeries([occurred, todayStr], soldUnits, priceSeries, fxSeries);
  // For a non-USD-priced holding, if the engine couldn't apply FX it leaves the
  // native amount mislabeled as USD (and flags it in `assumptions`). Converting
  // that to the display currency would double-apply a rate and show a wrong
  // magnitude — so fail closed rather than stamp a number we don't trust.
  if (assumptions.some((a) => a.includes("FX unavailable"))) return { ok: false, reason: "no_fx" };
  const thenUsd = series[0]?.valueUsd ?? 0;
  const nowUsd = series[1]?.valueUsd ?? 0;
  if (!(thenUsd > 0)) return { ok: false, reason: "no_basis" }; // no usable price on/before the sell date

  const { kind, magnitudeUsd } = classifyVerdict(thenUsd, nowUsd);

  // Express the magnitude AND the then/now values in the user's display currency;
  // fall back to USD (all three together, so they stay consistent) if a rate is
  // unavailable rather than inventing a number.
  let currency = "USD";
  let figure = magnitudeUsd;
  let valueThen = thenUsd;
  let valueNow = nowUsd;
  if (displayCurrency && displayCurrency !== "USD") {
    const [mag, vThen, vNow] = await Promise.all([
      toDisplay(magnitudeUsd, "USD", displayCurrency),
      toDisplay(thenUsd, "USD", displayCurrency),
      toDisplay(nowUsd, "USD", displayCurrency),
    ]);
    if (mag != null && vThen != null && vNow != null) {
      figure = mag;
      valueThen = vThen;
      valueNow = vNow;
      currency = displayCurrency;
    }
  }

  return {
    ok: true,
    data: {
      kind,
      figure,
      currency,
      lookbackLabel: lookbackLabel(daysAgo),
      assetName: m.asset_name ?? m.symbol,
      detail: { units: soldUnits, valueThen, valueNow, soldDate: occurred },
      assumptions: [
        "What the freed-up cash did afterwards is not counted — this weighs only the position you let go.",
        ...assumptions,
      ],
    },
  };
}
