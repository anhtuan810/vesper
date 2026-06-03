// Pure resolver: maps a chat-referenced position ("Bitcoin", "BTC", "crypto") to a
// held tradeable, or reports why it can't (ambiguous / non-tradeable / not held).
// No I/O — used by the chat scenario branch and unit-tested directly.

export interface AssetRef {
  id: string;
  name: string;
  type: string;
  symbol: string | null;
}

export type Resolution =
  | { kind: "resolved"; asset: AssetRef }
  | { kind: "ambiguous"; matches: AssetRef[] }
  | { kind: "non_tradeable"; asset: AssetRef }
  | { kind: "none" };

const TRADEABLE = new Set(["stocks", "etf", "crypto"]);

export function resolveScenarioAsset(assets: AssetRef[], query: string): Resolution {
  const q = query.trim().toLowerCase();
  const tradeables = assets.filter((a) => TRADEABLE.has(a.type));

  // 1) exact symbol/name
  let matches = tradeables.filter((a) => (a.symbol && a.symbol.toLowerCase() === q) || a.name.toLowerCase() === q);
  // 2) a bare asset-class word ("crypto", "stocks", "etf")
  if (matches.length === 0) {
    const typeKey = q.startsWith("crypto") ? "crypto" : q.startsWith("etf") ? "etf" : q.startsWith("stock") ? "stocks" : null;
    if (typeKey) matches = tradeables.filter((a) => a.type === typeKey);
  }
  // 3) substring either direction
  if (matches.length === 0) {
    matches = tradeables.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.symbol ? a.symbol.toLowerCase().includes(q) : false) ||
        q.includes(a.name.toLowerCase()) ||
        (a.symbol ? q.includes(a.symbol.toLowerCase()) : false),
    );
  }

  if (matches.length === 1) return { kind: "resolved", asset: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", matches };

  const nonTradeable = assets.find(
    (a) => !TRADEABLE.has(a.type) && (a.name.toLowerCase() === q || a.name.toLowerCase().includes(q)),
  );
  if (nonTradeable) return { kind: "non_tradeable", asset: nonTradeable };
  return { kind: "none" };
}

export type HeldResolution =
  | { kind: "resolved"; asset: AssetRef }
  | { kind: "ambiguous"; matches: AssetRef[] }
  | { kind: "none" };

// General resolver over ALL held assets (any type) — used by present-scenario
// modifications (sell/set/remove can target any holding, not only tradeables).
export function resolveHeldAsset(assets: AssetRef[], query: string): HeldResolution {
  const q = query.trim().toLowerCase();
  let matches = assets.filter((a) => (a.symbol && a.symbol.toLowerCase() === q) || a.name.toLowerCase() === q);
  if (matches.length === 0) {
    matches = assets.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        (a.symbol ? a.symbol.toLowerCase().includes(q) : false) ||
        q.includes(a.name.toLowerCase()) ||
        (a.symbol ? q.includes(a.symbol.toLowerCase()) : false),
    );
  }
  if (matches.length === 1) return { kind: "resolved", asset: matches[0] };
  if (matches.length > 1) return { kind: "ambiguous", matches };
  return { kind: "none" };
}
