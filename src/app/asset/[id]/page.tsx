import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { TradeableDetail } from "@/components/asset-detail/TradeableDetail";
import { RealEstateDetail } from "@/components/asset-detail/RealEstateDetail";
import { StaticDetail } from "@/components/asset-detail/StaticDetail";
import { PensionDetail } from "@/components/asset-detail/PensionDetail";
import { DesktopFrame } from "@/components/desktop/DesktopFrame";
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

  let detail: React.ReactNode = null;
  if (type === "stocks" || type === "etf" || type === "crypto" || type === "gold") {
    detail = <TradeableDetail asset={asset as TradeableAsset} />;
  } else if (type === "real_estate") {
    detail = <RealEstateDetail asset={asset as RealEstateAsset} />;
  } else if (type === "pension") {
    // Pension branches to its own two-shape layouts; birth_year (from the users
    // table) feeds the capital projection / income timeline.
    const { data: urow } = await supabase
      .from("users")
      .select("birth_year")
      .eq("id", user.id)
      .single();
    const birthYear = typeof urow?.birth_year === "number" ? urow.birth_year : null;
    detail = <PensionDetail asset={asset as StaticAsset} birthYear={birthYear} />;
  } else if (type === "bonds" || type === "cash" || type === "other") {
    detail = <StaticDetail asset={asset as StaticAsset | BondsAsset} />;
  }

  if (!detail) notFound();

  // Desktop web adopts the three-pane shell (Vitals + content + chat);
  // mobile and native render the detail unchanged.
  return <DesktopFrame tab="portfolio">{detail}</DesktopFrame>;
}
