// Pure cross-rate currency conversion. `rates` is a USD-based map where
// rates[c] = how many units of `c` equal 1 USD (USD itself is implicitly 1).
// No env-specific imports — usable from both server and client code.
export function convertCurrency(
  amount: number,
  from: string,
  to: string,
  rates: Record<string, number>,
): number | null {
  if (from === to) return amount; // identity — no math, no drift
  const rFrom = from === "USD" ? 1 : rates[from];
  const rTo = to === "USD" ? 1 : rates[to];
  if (!rFrom || !rTo) return null; // caller decides (skeleton / fallback)
  return amount * (rTo / rFrom);
}
