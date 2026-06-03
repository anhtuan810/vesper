"use client";

import { useSyncExternalStore } from "react";

// Tiny module-level pub/sub: a monotonically increasing revision counter that is
// bumped after every successful portfolio mutation (chat save, asset restore).
// Surfaces read it via usePortfolioRevision() and refetch when it changes, so a
// mutation on one surface refreshes all of them without a manual reload.
// No external dependency — useSyncExternalStore is built into React.

let revision = 0;
const listeners = new Set<() => void>();

export function bumpPortfolioRevision(): void {
  revision += 1;
  for (const listener of listeners) listener();
}

export function getPortfolioRevision(): number {
  return revision;
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

// Returns the current revision and re-renders the caller whenever it bumps.
// Server snapshot is always 0 (mutations only happen client-side).
export function usePortfolioRevision(): number {
  return useSyncExternalStore(subscribe, getPortfolioRevision, () => 0);
}
