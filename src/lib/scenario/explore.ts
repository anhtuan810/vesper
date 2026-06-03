"use client";

// Scenario-explore entry: builds the seed that opens the chat with a forward
// cone and three personalized, tense-spanning suggestion chips (present/shock,
// future, past) drawn from the user's real holdings. Figures come from
// /api/scenarios/project and /api/snapshots — nothing is projected here.

import { getUsdRate, toUsdClient, type DisplayCurrency } from "@/lib/money";
import type { ChatSeed, ExploreCone } from "@/lib/chat-seeds";
import type { LiveAsset } from "@/lib/supabase";

const HORIZON_YEARS = 10;
const SYMBOL: Record<DisplayCurrency, string> = { EUR: "€", USD: "$", GBP: "£" };
const TRADEABLE = new Set(["stocks", "etf", "crypto"]);

// Trigger plumbing — desktop has the chat panel mounted (fire an event the shell
// listens for); mobile navigates to /chat, which reads this flag on mount.
export const EXPLORE_KEY = "volnar.scenario.explore";
export const EXPLORE_EVENT = "volnar:scenario-explore";

/** Returns true when handled in-place (desktop); false when the caller should navigate to /chat. */
export function requestExplore(isDesktop: boolean): boolean {
  if (isDesktop) {
    window.dispatchEvent(new CustomEvent(EXPLORE_EVENT));
    return true;
  }
  try { sessionStorage.setItem(EXPLORE_KEY, "1"); } catch {}
  return false;
}

export function takeExploreFlag(): boolean {
  try {
    if (sessionStorage.getItem(EXPLORE_KEY) === "1") {
      sessionStorage.removeItem(EXPLORE_KEY);
      return true;
    }
  } catch {}
  return false;
}

interface ProjResp {
  startUsd: number;
  rate: number;
  trajectory: { low: number; mid: number; high: number };
  assumptions: string[];
}

function isThinHistory(r: ProjResp): boolean {
  return r.assumptions.some((a) => /default/i.test(a) && /nominal/i.test(a));
}

function tradeablesByValue(assets: LiveAsset[]): LiveAsset[] {
  return assets
    .filter((a) => TRADEABLE.has(a.type))
    .map((a) => ({ a, usd: toUsdClient(a.value, a.currency || "USD") }))
    .sort((x, y) => y.usd - x.usd)
    .map((x) => x.a);
}

/**
 * One chip per tense, personalized from holdings; degrades gracefully:
 * present/shock → largest tradeable (else a generic market shock if any assets),
 * future → fixed monthly contribution, past → a held tradeable (a second name if
 * available). Always returns 1–3 chips.
 */
export function buildExploreChips(assets: LiveAsset[], displayCurrency: DisplayCurrency): string[] {
  const sym = SYMBOL[displayCurrency] ?? "€";
  const tr = tradeablesByValue(assets);
  const chips: string[] = [];

  if (tr[0]) chips.push(`What if ${tr[0].name} drops 30%?`);
  else if (assets.length > 0) chips.push("What if markets drop 20%?");

  chips.push(`What if you add ${sym}500 a month?`);

  const pastName = tr[1]?.name ?? tr[0]?.name;
  if (pastName) chips.push(`What did ${pastName} cost or make you?`);

  return chips;
}

/** Fetches the projection + history and assembles the explore seed (cone + chips). */
export async function buildExploreSeed(assets: LiveAsset[], displayCurrency: DisplayCurrency): Promise<ChatSeed> {
  const chips = buildExploreChips(assets, displayCurrency);

  let proj: ProjResp | null = null;
  let history: Array<{ date: string; total_value: number }> = [];
  try {
    const [pr, sr] = await Promise.all([
      fetch("/api/scenarios/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "trajectory", horizonYears: HORIZON_YEARS }),
      }),
      fetch("/api/snapshots?range=All"),
    ]);
    if (pr.ok) proj = (await pr.json()) as ProjResp;
    if (sr.ok) { const b = await sr.json(); history = (b.data ?? []) as typeof history; }
  } catch { /* fall through to the no-cone variant */ }

  // No fabricated figure on thin/insufficient history: text intro + chips only.
  if (!proj || !proj.trajectory || isThinHistory(proj) || proj.startUsd < 1000) {
    return {
      message: "Tell me a bit more about what you hold and I'll map where you're heading. In the meantime, here's somewhere to start:",
      chips,
    };
  }

  const rate = getUsdRate(displayCurrency);
  const toDisp = (usd: number) => usd * rate;
  const sym = SYMBOL[displayCurrency] ?? "€";
  const now = new Date();
  const horizonDate = new Date(now);
  horizonDate.setFullYear(now.getFullYear() + HORIZON_YEARS);
  const year = horizonDate.getFullYear();

  const compact = (dispNum: number) => {
    const n = Math.abs(dispNum);
    if (n >= 1_000_000) return `${sym}${(n / 1_000_000).toFixed(n < 10_000_000 ? 1 : 0)}M`;
    if (n >= 1_000) return `${sym}${Math.round(n / 1_000)}K`;
    return `${sym}${Math.round(n)}`;
  };

  const cone: ExploreCone = {
    history: history.map((h) => ({ t: Date.parse(h.date), v: toDisp(h.total_value) })),
    today: { t: now.getTime(), v: toDisp(proj.startUsd) },
    horizon: {
      t: horizonDate.getTime(),
      low: toDisp(proj.trajectory.low),
      mid: toDisp(proj.trajectory.mid),
      high: toDisp(proj.trajectory.high),
    },
    horizonYear: year,
    symbol: sym,
    line: `Keep this pace and you're near ${compact(toDisp(proj.trajectory.mid))} by ${year}.`,
  };

  return {
    message: "Here's where your portfolio could be heading if nothing changes — and a few ways to pressure-test it.",
    chips,
    cone,
  };
}
