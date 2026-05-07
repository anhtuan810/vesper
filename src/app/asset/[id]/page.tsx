import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { TradeableDetail } from "@/components/asset-detail/TradeableDetail";
import { RealEstateDetail } from "@/components/asset-detail/RealEstateDetail";
import { StaticDetail } from "@/components/asset-detail/StaticDetail";
import type { TradeableAsset, RealEstateAsset, StaticAsset, BondsAsset } from "@/lib/supabase";

export default async function AssetPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: asset } = await supabase
    .from("assets")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!asset) notFound();

  const { type } = asset;

  if (type === "stocks" || type === "etf" || type === "crypto" || type === "gold") {
    return <TradeableDetail asset={asset as TradeableAsset} />;
  }

  if (type === "real_estate") {
    return <RealEstateDetail asset={asset as RealEstateAsset} />;
  }

  if (type === "bonds") {
    return <StaticDetail asset={asset as BondsAsset} />;
  }

  if (type === "cash" || type === "pension" || type === "other") {
    return <StaticDetail asset={asset as StaticAsset} />;
  }

  return null;
}
