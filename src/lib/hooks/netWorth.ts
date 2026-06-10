"use client";

import { useMemo } from "react";
import { useUser } from "./user";
import { useAssets } from "./assets";
import { toDisplay } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";

export function useNetWorth() {
  const { user } = useUser();
  const { assets, loading } = useAssets(user?.id);

  // Always EUR — feeds the EUR-denominated percentile tables in
  // computePerspective (NL/EU/world percentiles), independent of the user's
  // chosen display currency.
  const netWorthEur = useMemo(() => {
    return assets.reduce((total, a) => {
      const cur = a.currency || "USD";
      const native = a.type === "real_estate"
        ? Math.max(0, a.value - computeCurrentBalance(a))
        : a.value;
      const inEur = toDisplay(native, cur, "EUR");
      return inEur != null ? total + inEur : total;
    }, 0);
  }, [assets]);

  return { netWorthEur, loading };
}
