"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useUser, useAssets, useDisplayCurrency } from "@/lib/hooks";
import { PortfolioSummaryCard } from "@/components/PortfolioSummaryCard";
import { toDisplay } from "@/lib/money";
import { computeCurrentBalance } from "@/lib/mortgage";
import { requestExplore } from "@/lib/scenario/explore";
import { apiFetch } from "@/lib/api";
import type { SnapshotPoint } from "@/components/NetWorthChart";
import type { MarketHighlight } from "@/lib/market-highlights";

// Self-contained host for the Portfolio summary card (Projection + Worth knowing
// + Markets) at the top of the Vitals page. It loads everything the card needs —
// assets (for the display-currency net worth the projection anchors to), the
// snapshot history (the projection's young-account gate), and the daily market
// highlights — so the Vitals page can drop it in with no props. Renders nothing
// until there are assets; the card itself collapses to nothing when no row has
// content, so a thin/empty account shows no stray box.
export function PortfolioSummaryCardLoader() {
  const router = useRouter();
  const { user } = useUser();
  const { assets } = useAssets(user?.id);
  const displayCurrency = useDisplayCurrency();
  const [snapshots, setSnapshots] = useState<SnapshotPoint[]>([]);
  const [marketHighlights, setMarketHighlights] = useState<MarketHighlight[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    const ctrl = new AbortController();
    apiFetch("/api/snapshots?range=All", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b?.data) setSnapshots(b.data); })
      .catch(() => {});
    apiFetch("/api/market-highlights", { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((b) => { if (b?.marketHighlights) setMarketHighlights(b.marketHighlights); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [user?.id]);

  // Display-currency net worth — equity-floored real estate, summed in the
  // display currency (identity for home-currency assets). Mirrors page.tsx so the
  // projection on Vitals anchors to the same figure the Portfolio hero shows.
  const netTotal = useMemo(
    () => assets.reduce((sum, a) => {
      const cur = a.currency || "USD";
      const native = a.type === "real_estate" ? Math.max(0, a.value - computeCurrentBalance(a)) : a.value;
      const inDisplay = toDisplay(native, cur, displayCurrency);
      return inDisplay != null ? sum + inDisplay : sum;
    }, 0),
    [assets, displayCurrency],
  );

  const onExplore = () => { if (!requestExplore(false)) router.push("/chat"); };

  if (assets.length === 0) return null;

  return (
    <PortfolioSummaryCard
      netTotal={netTotal}
      snapshots={snapshots}
      marketHighlights={marketHighlights}
      onExplore={onExplore}
      embedded
    />
  );
}
