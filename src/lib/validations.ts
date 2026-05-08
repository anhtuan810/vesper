// Anything clearly below zero after float arithmetic is invalid.
// The positive bound (UNIT_MIN) guards against adding a zero-unit position.
const NEG_TOLERANCE = -1e-9;
const UNIT_MIN = 1e-9;

type ChangeItem = {
  action: "add" | "edit" | "remove";
  name: string;
  value?: number;
  units?: number;
};

type AssetSnapshot = {
  name: string;
  symbol?: string | null;
  type?: string;
  units?: number | null;
};

function unitNounFor(type: string | undefined): string {
  if (type === "crypto") return "units";
  if (type === "gold") return "oz";
  return "shares";
}

function findAsset(name: string, assets: AssetSnapshot[]): AssetSnapshot | undefined {
  const key = name.toLowerCase();
  return assets.find(
    (a) =>
      a.name.toLowerCase() === key ||
      (a.symbol != null && a.symbol.toLowerCase() === key)
  );
}

/**
 * Returns the first validation error message, or null if all changes are valid.
 * Must run before any DB write so failures are all-or-nothing.
 */
export function validatePortfolioChanges(
  changes: ChangeItem[],
  currentAssets: AssetSnapshot[]
): string | null {
  for (const change of changes) {
    const { action, name } = change;

    if (action === "remove") continue;

    if (action === "add") {
      if (change.units !== undefined && change.units < UNIT_MIN) {
        return "A new position needs a positive size. Could you check the numbers?";
      }
      if (change.value !== undefined && change.value < NEG_TOLERANCE) {
        return "A new position needs a positive size. Could you check the numbers?";
      }
      continue;
    }

    if (action === "edit") {
      const existing = findAsset(name, currentAssets);
      if (!existing) continue; // apply-changes will silently skip unknown assets too

      if (change.units !== undefined && existing.units != null) {
        if (change.units < NEG_TOLERANCE) {
          const noun = unitNounFor(existing.type);
          const sellQty = existing.units - change.units;
          const sellQtyStr = Number.isInteger(sellQty)
            ? String(sellQty)
            : sellQty.toFixed(8).replace(/\.?0+$/, "");
          const currentStr = Number.isInteger(existing.units)
            ? String(existing.units)
            : existing.units.toFixed(8).replace(/\.?0+$/, "");
          return (
            `That would leave a negative position. You hold ${currentStr} ${existing.name} — ` +
            `selling ${sellQtyStr} ${noun} isn't possible.`
          );
        }
      }

      if (change.value !== undefined && change.value < NEG_TOLERANCE) {
        return (
          `That change would make ${existing.name} worth less than zero. ` +
          `If you meant to close the position, say so explicitly.`
        );
      }
    }
  }

  return null;
}
