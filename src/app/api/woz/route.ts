import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { getWozHistory } from "@/lib/woz";

// GET /api/woz?assetId=<id>  (preferred — server reads the address for the authed
// user) or ?address=<addr>&country=<cc>. Deterministic, server-side only; NL-only.
// Never throws to the client — failures return { available: false }.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ available: false }, { status: 401 });

    const assetId = request.nextUrl.searchParams.get("assetId")?.trim() || null;
    let address: string | null = request.nextUrl.searchParams.get("address")?.trim() || null;
    let country: string | null = request.nextUrl.searchParams.get("country")?.trim() || null;

    // Prefer the asset's own stored address/country (scoped to the authed user),
    // so the client never has to send — and we never trust — a free-text address.
    if (assetId) {
      const supabase = createServerSupabase();
      const { data: asset } = await supabase
        .from("assets")
        .select("address, country, type")
        .eq("id", assetId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!asset || asset.type !== "real_estate") {
        return NextResponse.json({ available: false });
      }
      address = (asset.address as string | null) ?? address;
      country = (asset.country as string | null) ?? country;
    }

    const result = await getWozHistory({ address, country });
    const res = NextResponse.json(result);
    // Cache the resolved result briefly at the edge/browser; the deterministic
    // 90-day server cache lives in woz_cache.
    if (result.available) {
      res.headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=86400");
    }
    return res;
  } catch {
    // Defensive: never surface an error to the client.
    return NextResponse.json({ available: false });
  }
}
