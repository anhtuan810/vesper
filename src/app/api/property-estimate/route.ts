import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { resolveRegion } from "@/lib/property-region";
import { getRegionIndex, targetRegionName } from "@/lib/cbs-pbk";
import { estimateValue, estimateSeries, parseBuyYear, clampBuyYear } from "@/lib/property-estimate";

// GET /api/property-estimate?assetId=<id> — deterministic CBS-PBK value estimate
// for an authed user's NL real-estate asset. Server-side only; NO LLM. Everything
// is wrapped so it never throws to the client; any failure returns { available: false }.

function isNL(country: string | null | undefined): boolean {
  const c = (country || "").trim().toUpperCase();
  return c === "NL" || c === "NLD" || c === "NETHERLANDS" || c === "THE NETHERLANDS";
}

const UNAVAILABLE = { available: false } as const;

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json(UNAVAILABLE, { status: 401 });

    const assetId = request.nextUrl.searchParams.get("assetId")?.trim();
    if (!assetId) return NextResponse.json(UNAVAILABLE);

    const supabase = createServerSupabase();
    const { data: asset } = await supabase
      .from("assets")
      .select("address, country, type, value, buy_price, buy_date")
      .eq("id", assetId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!asset || asset.type !== "real_estate" || !isNL(asset.country as string | null)) {
      return NextResponse.json(UNAVAILABLE);
    }

    // Basis = logged purchase price; fall back to the stored value when no purchase
    // price was recorded. No basis at all → unavailable.
    const buyPrice = typeof asset.buy_price === "number" && asset.buy_price > 0 ? asset.buy_price : null;
    const storedValue = typeof asset.value === "number" && asset.value > 0 ? asset.value : null;
    const basis = buyPrice ?? storedValue;
    const requestedYear = parseBuyYear(asset.buy_date as string | null);
    if (basis == null || requestedYear == null) return NextResponse.json(UNAVAILABLE);

    const region = await resolveRegion(asset.address as string | null);
    if (!region) return NextResponse.json(UNAVAILABLE);

    const regionIndex = await getRegionIndex(region.gemeente, region.province);
    if (!regionIndex || regionIndex.points.length === 0) return NextResponse.json(UNAVAILABLE);

    const currentEstimate = estimateValue(basis, requestedYear, regionIndex.points);
    const series = estimateSeries(basis, requestedYear, regionIndex.points);
    if (currentEstimate == null || series.length === 0) return NextResponse.json(UNAVAILABLE);

    const result = {
      available: true as const,
      currentEstimate: Math.round(currentEstimate),
      series: series.map((p) => ({ year: p.year, value: Math.round(p.value) })),
      // Human-readable region actually used for the index (G4 city or province),
      // from the already-resolved region — no second lookup.
      regionName: targetRegionName(region.gemeente, region.province) ?? regionIndex.regionCode,
      regionCode: regionIndex.regionCode,
      asOfPeriod: regionIndex.asOfPeriod,
      clamped: clampBuyYear(requestedYear).clamped,
    };
    const res = NextResponse.json(result);
    res.headers.set("Cache-Control", "private, max-age=3600, stale-while-revalidate=86400");
    return res;
  } catch {
    // Defensive: never surface an error to the client.
    return NextResponse.json(UNAVAILABLE);
  }
}
