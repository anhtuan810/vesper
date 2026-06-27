"use client";

// Asset detail at /asset?id=<id>. A client page (not /asset/[id]) so the route
// is a single static shell in the native bundle — static export can't
// enumerate per-user asset ids. The old /asset/[id] URLs redirect here on the
// web. Data comes straight from Supabase under RLS, same as the hooks layer.

import { Suspense, useEffect, useState } from "react";
import { notFound, useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase";
import { TradeableDetail } from "@/components/asset-detail/TradeableDetail";
import { RealEstateDetail } from "@/components/asset-detail/RealEstateDetail";
import { StaticDetail } from "@/components/asset-detail/StaticDetail";
import { PensionDetail } from "@/components/asset-detail/PensionDetail";
import { WebFrame } from "@/components/desktop/WebFrame";
import type { Asset, TradeableAsset, RealEstateAsset, StaticAsset, BondsAsset } from "@/lib/supabase";

type LoadState =
  | { kind: "loading" }
  | { kind: "notfound" }
  | { kind: "ready"; asset: Asset; birthYear: number | null };

function AssetDetailInner() {
  const router = useRouter();
  const id = useSearchParams().get("id");
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    if (!id) {
      setState({ kind: "notfound" }); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }
    let cancelled = false;
    (async () => {
      const supabase = createBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace(`/login?next=${encodeURIComponent(`/asset?id=${id}`)}`);
        return;
      }
      const { data: asset } = await supabase
        .from("assets")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .single();
      if (cancelled) return;
      if (!asset) {
        setState({ kind: "notfound" });
        return;
      }
      // birth_year (users table) feeds the pension capital projection / income
      // timeline — mirrors the old server page.
      let birthYear: number | null = null;
      if (asset.type === "pension") {
        const { data: urow } = await supabase
          .from("users")
          .select("birth_year")
          .eq("id", user.id)
          .single();
        birthYear = typeof urow?.birth_year === "number" ? urow.birth_year : null;
      }
      if (!cancelled) setState({ kind: "ready", asset: asset as Asset, birthYear });
    })();
    return () => { cancelled = true; };
  }, [id, router]);

  if (state.kind === "notfound") notFound();
  if (state.kind === "loading") return <div className="min-h-screen bg-bg" />;

  const { asset, birthYear } = state;
  const { type } = asset;

  let detail: React.ReactNode = null;
  if (type === "stocks" || type === "etf" || type === "crypto" || type === "gold") {
    detail = <TradeableDetail asset={asset as TradeableAsset} />;
  } else if (type === "real_estate") {
    detail = <RealEstateDetail asset={asset as RealEstateAsset} />;
  } else if (type === "pension") {
    detail = <PensionDetail asset={asset as StaticAsset} birthYear={birthYear} />;
  } else if (type === "bonds" || type === "cash" || type === "other") {
    detail = <StaticDetail asset={asset as StaticAsset | BondsAsset} />;
  }

  if (!detail) notFound();

  // Desktop web adopts the new Twilight WebShell (nav + content + chat rail);
  // mobile and native render the detail unchanged.
  return <WebFrame tab="asset">{detail}</WebFrame>;
}

export default function AssetPage() {
  // useSearchParams requires a Suspense boundary in prerendered pages.
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <AssetDetailInner />
    </Suspense>
  );
}
