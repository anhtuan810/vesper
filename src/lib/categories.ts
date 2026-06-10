// Single source of truth for the 4 semantic net-worth categories — used by the
// Holdings groups and the net-worth stacked-area chart alike.

// Semantic category mapping — 4 groups, regardless of how many asset types exist
export const CATEGORY_MAP: Record<string, string> = {
  real_estate: "property",
  stocks:      "markets",
  etf:         "markets",
  crypto:      "crypto",
  cash:        "reserves",
  pension:     "reserves",
  bonds:       "reserves",
  gold:        "reserves",
  other:       "reserves",
};

export const CATEGORY_LABEL: Record<string, string> = {
  property: "Property",
  markets:  "Public markets",
  reserves: "Reserves",
  crypto:   "Crypto",
};

// Compact variant for tight spaces (e.g. the net-worth chart's hover
// breakdown) — "Public markets" is the only label long enough to wrap at
// that width, so it alone gets a shorter form.
export const CATEGORY_LABEL_SHORT: Record<string, string> = {
  ...CATEGORY_LABEL,
  markets: "Markets",
};

// CSS variable references — resolved at paint time, respects light/dark theme
export const CATEGORY_COLOR: Record<string, string> = {
  property: "var(--category-property)",
  markets:  "var(--category-public-markets)",
  reserves: "var(--category-reserves)",
  crypto:   "var(--category-crypto)",
};

export const ALL_CATEGORIES = ["property", "markets", "reserves", "crypto"] as const;

// Fixed display order for the holdings groups — Crypto sits above Reserves
// (a deliberate semantic order, not value-ranked).
export const CATEGORY_ORDER: Record<string, number> = {
  property: 0,
  markets:  1,
  crypto:   2,
  reserves: 3,
};

export type Category = "property" | "markets" | "crypto" | "reserves";

// Bottom-to-top stacking order for the net-worth area chart, derived from
// CATEGORY_ORDER ascending: property, markets, crypto, reserves.
export const STACK_ORDER: Category[] = (Object.entries(CATEGORY_ORDER) as Array<[Category, number]>)
  .sort((a, b) => a[1] - b[1])
  .map(([cat]) => cat);

// Folds a snapshot's asset-type breakdown (USD) into the 4 semantic
// categories via CATEGORY_MAP. Unknown types fall to "reserves"; absent
// categories are 0.
export function categoryBreakdown(breakdown: Record<string, number> | null | undefined): Record<Category, number> {
  const result: Record<Category, number> = { property: 0, markets: 0, crypto: 0, reserves: 0 };
  if (!breakdown) return result;
  for (const [type, value] of Object.entries(breakdown)) {
    const cat = (CATEGORY_MAP[type] ?? "reserves") as Category;
    result[cat] += value;
  }
  return result;
}
