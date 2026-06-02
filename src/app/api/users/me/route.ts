import * as Sentry from "@sentry/nextjs";
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
      if (!["light", "dark"].includes(body.theme)) {
        return NextResponse.json(
          { error: "Invalid theme: must be light or dark" },
          { status: 400 }
        );
      }
      updateData.theme = body.theme;
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

// Permanent, irreversible account deletion. The user id is resolved from the
// session only — never from the request body. Removes every row owned by the
// user across all tables, then the users row, then the auth user itself.
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const supabase = createServerSupabase();

  try {
    // Order matters: dependent data first, the users row last, auth user after.
    // Every user-scoped table is listed explicitly (all keyed by user_id).
    // rate_limits is omitted — it has ON DELETE CASCADE to users(id); fx_rates
    // is global and intentionally untouched.
    const tables = ["messages", "highlights", "goals", "snapshots", "mutations", "assets", "diary_summaries", "vital_snapshots", "scenarios"];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Failed deleting ${table}: ${error.message}`);
    }

    const { error: userError } = await supabase.from("users").delete().eq("id", userId);
    if (userError) throw new Error(`Failed deleting users row: ${userError.message}`);

    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`Failed deleting auth user: ${authError.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "DELETE /api/users/me" } });
    return NextResponse.json({ error: "Failed to delete account" }, { status: 500 });
  }
}
