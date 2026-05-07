import { NextRequest, NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocode";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address")?.trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const result = await geocodeAddress(address);
  if (!result) {
    return NextResponse.json({ error: "address not found" }, { status: 404 });
  }
  return NextResponse.json(result);
}
