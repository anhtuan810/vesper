"use client";

import { useSyncExternalStore } from "react";
import { apiFetch } from "@/lib/api";
import { bumpPortfolioRevision } from "@/lib/portfolio-revision";

// Tracks the background rebuild that a chat add kicks off: reconstructing the
// net-worth HISTORY to include a newly added, past-dated holding, plus the market
// notes on its journal entries. That work runs server-side AFTER the reply is
// sent, so the chart and journal aren't ready the instant the answer lands. This
// module lets every surface show a quiet "building" indicator and auto-refresh
// until the rebuilt data appears — no manual reload.
//
// Module-level (not React state) so the watch survives tab navigation: the user
// can leave Chat for Overview mid-build and the indicator + refresh continue.

let building = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function setBuilding(next: boolean): void {
  if (building === next) return;
  building = next;
  emit();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** True while a post-add history/market rebuild is in flight. */
export function usePortfolioBuilding(): boolean {
  return useSyncExternalStore(subscribe, () => building, () => false);
}

// A cheap fingerprint of the whole net-worth history. backfillSnapshots rewrites
// the historical rows to fold in the new holding, so this string changes the
// moment the rebuild lands — our signal that "building" is done.
async function historySignature(): Promise<string> {
  try {
    const res = await apiFetch("/api/snapshots?range=All", { cache: "no-store" });
    if (!res.ok) return "";
    const { data } = await res.json();
    const arr: Array<{ date?: string; total_value?: number }> = Array.isArray(data) ? data : [];
    let sum = 0;
    for (const p of arr) sum += p.total_value ?? 0;
    return `${arr.length}:${Math.round(sum)}`;
  } catch {
    return "";
  }
}

// Only one watch at a time; a newer add supersedes an older one.
let activeWatch = 0;

// Poll until the rebuilt history appears (signature changes from its pre-add
// value), bumping the shared revision each tick so mounted surfaces refetch, then
// clear the flag. A generous ceiling guarantees the indicator can never hang if
// the rebuild fails or the signal is missed.
export function watchPortfolioBuild(): void {
  const token = ++activeWatch;
  setBuilding(true);

  const STEP_MS = 5000;
  const MAX_MS = 90_000;

  void (async () => {
    const baseline = await historySignature();
    const started = Date.now();
    while (activeWatch === token && Date.now() - started < MAX_MS) {
      await new Promise((r) => setTimeout(r, STEP_MS));
      if (activeWatch !== token) return; // a newer add took over
      bumpPortfolioRevision(); // pull fresh assets / snapshots / mutations everywhere
      const sig = await historySignature();
      if (sig && baseline && sig !== baseline) break; // rebuilt history is in
    }
    if (activeWatch !== token) return;
    bumpPortfolioRevision(); // final refresh so market notes/swings land too
    setBuilding(false);
  })();
}

// A commit that didn't trigger a full history rebuild (e.g. "just track from
// now") still generates market notes on the new entries in the background. One
// delayed refresh catches those without showing the prominent building UI.
export function refreshAfterQuickCommit(): void {
  const token = ++activeWatch; // supersede any prior watch; no building flag
  setBuilding(false);
  window.setTimeout(() => {
    if (activeWatch === token) bumpPortfolioRevision();
  }, 7000);
}
