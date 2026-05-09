import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    // Field allowlist — display_currency only for now
    if ("display_currency" in body) {
      if (!isSupportedCurrency(body.display_currency)) {
        return NextResponse.json(
          { error: "Invalid display_currency: must be EUR, USD, or GBP" },
          { status: 400 }
        );
      }
      updateData.display_currency = body.display_currency;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase
      .from("users")
      .update(updateData)
      .eq("id", user.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
