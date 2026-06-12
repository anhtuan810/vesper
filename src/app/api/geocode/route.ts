import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";
import { getAuthUser } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const country = request.nextUrl.searchParams.get("country")?.trim() || undefined;
  const result = await geocodeAddress(address, country);
  if (!result) {
    return NextResponse.json({ error: "address not found" }, { status: 404 });
  }
  // Geocoding is deterministic per (address, country) — cache aggressively.
  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, max-age=86400, stale-while-revalidate=604800" },
  });
}
