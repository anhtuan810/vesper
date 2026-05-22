"use client";

import { useMemo } from "react";
import { useUser } from "./user";
import { useAssets } from "./assets";
import { toUsdClient, getUsdRate } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";

export function useNetWorth() {
  const { user } = useUser();
  const { assets, loading } = useAssets(user?.id);

  const netWorthEur = useMemo(() => {
    const usd = assets.reduce((sum, a) => {
      const cur = a.currency || "USD";
      const valueUsd = toUsdClient(a.value, cur);
      const mortUsd = a.type === "real_estate"
        ? toUsdClient(computeCurrentBalance(a), cur)
        : 0;
      return sum + valueUsd - mortUsd;
    }, 0);
    return usd * getUsdRate("EUR");
  }, [assets]);

  return { netWorthEur, loading };
}
