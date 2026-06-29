import { CHAT_HISTORY_PREFIX } from "@/lib/constants";

// Wipes every client-side cache that holds account figures so no value from a
// previous account can render against the next session. sessionStorage SWR /
// bootstrap mirrors (assets, prices, vitals, diary, profile baseline, plus
// transient handoffs) all live under the `volnar`/`vitals.` namespaces; chat
// history is the only account data in localStorage. The module-level in-memory
// caches (vitals, insight) are userId-tagged and self-invalidate, and the
// portfolio-revision counter is reset by the caller.
//
// Used on a real account switch / sign-out (UserProvider) and when adopting a
// fresh demo session that reuses a SHARED user id (native demo entry) — the
// shared-account demo keeps one id across entries, so the id-change purge never
// fires and a previous visitor's chat would otherwise survive the server-side
// reseed. (Web handles the same case with a pre-hydration script in layout.tsx,
// since the chat hook reads localStorage before any React effect can run.)
export function purgeClientCaches(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && (k.startsWith("volnar") || k.startsWith("vitals."))) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(CHAT_HISTORY_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}
}
