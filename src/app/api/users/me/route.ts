import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";

const PROFILE_FIELD_KEYS = new Set([
  "goal", "risk_behaviour", "investment_style", "life_context",
  "concerns", "preferences", "blind_spots", "decision_patterns", "interests",
]);

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if ("display_currency" in body) {
      if (!isSupportedCurrency(body.display_currency)) {
        return NextResponse.json(
          { error: "Invalid display_currency: must be EUR, USD, or GBP" },
          { status: 400 }
        );
      }
      updateData.display_currency = body.display_currency;
    }

    if ("profile" in body) {
      if (typeof body.profile !== "object" || body.profile === null || Array.isArray(body.profile)) {
        return NextResponse.json({ error: "profile must be an object" }, { status: 400 });
      }

      const profilePatch = body.profile as Record<string, unknown>;
      for (const [key, value] of Object.entries(profilePatch)) {
        if (!PROFILE_FIELD_KEYS.has(key)) {
          return NextResponse.json({ error: `Unknown profile field: ${key}` }, { status: 400 });
        }
        if (value !== null && (typeof value !== "string" || value.length > 200)) {
          return NextResponse.json(
            { error: `profile.${key} must be a string (max 200 chars) or null` },
            { status: 400 }
          );
        }
      }

      const supabase = createServerSupabase();
      const { data: existing } = await supabase
        .from("users")
        .select("profile")
        .eq("id", user.id)
        .single();

      const merged: Record<string, string> = { ...(existing?.profile ?? {}) };
      for (const [key, value] of Object.entries(profilePatch)) {
        if (value === null || (typeof value === "string" && value.trim() === "")) {
          delete merged[key];
        } else {
          merged[key] = (value as string).trim();
        }
      }

      updateData.profile = merged;
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
