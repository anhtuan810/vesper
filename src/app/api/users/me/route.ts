import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";

const PROFILE_FIELD_KEYS = new Set([
  "life_and_direction", "approach", "currently_exploring", "worth_raising",
]);

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("name, avatar_url, display_currency, theme, fingerprint, profile")
    .eq("id", user.id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, {
    headers: { "Cache-Control": "private, max-age=300, stale-while-revalidate=1800" },
  });
}

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

    if ("theme" in body) {
      if (!["auto", "light", "dark"].includes(body.theme)) {
        return NextResponse.json(
          { error: "Invalid theme: must be auto, light, or dark" },
          { status: 400 }
        );
      }
      updateData.theme = body.theme;
    }

    if ("avatar_url" in body) {
      if (body.avatar_url !== null) {
        if (typeof body.avatar_url !== "string") {
          return NextResponse.json(
            { error: "avatar_url must be a string or null" },
            { status: 400 }
          );
        }
        try {
          const url = new URL(body.avatar_url);
          const expectedHost = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
          if (
            url.hostname !== expectedHost ||
            !url.pathname.includes("/user-avatars/")
          ) {
            return NextResponse.json(
              { error: "avatar_url must point to the user-avatars bucket on this project" },
              { status: 400 }
            );
          }
        } catch {
          return NextResponse.json(
            { error: "avatar_url must be a valid URL" },
            { status: 400 }
          );
        }
      }
      updateData.avatar_url = body.avatar_url;
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
