import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { TradeableDetail } from "@/components/asset-detail/TradeableDetail";
import type { Asset } from "@/lib/supabase";

const TRADEABLE_TYPES: Asset["type"][] = ["stocks", "etf", "crypto", "gold"];

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

  if (TRADEABLE_TYPES.includes(asset.type)) {
    return <TradeableDetail asset={asset as Asset} />;
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center max-w-xs">
        <div
          className="font-serif text-fg mb-2"
          style={{ fontSize: 20, fontWeight: 400, fontVariationSettings: "'opsz' 144" }}
        >
          {asset.name}
        </div>
        <div className="font-mono text-faint" style={{ fontSize: 12 }}>
          Detail page coming in a later phase.
        </div>
      </div>
    </div>
  );
}
