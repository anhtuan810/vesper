import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { rateLimitGate } from "@/lib/rate-limit";
import { GEOCODE_DAILY_LIMIT } from "@/lib/constants";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Geocoding hits Nominatim (shared 3rd-party dependency with a strict usage
  // policy). Cap per-user daily calls so a loop can't get the server IP banned,
  // which would break property-add for every user.
  const limited = await rateLimitGate(createServerSupabase(), user.id, "geocode", GEOCODE_DAILY_LIMIT);
  if (limited) return limited;

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
