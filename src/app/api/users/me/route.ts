import * as Sentry from "@sentry/nextjs";
import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { isSupportedCurrency } from "@/lib/money";
import { getEntitlement } from "@/lib/entitlements";
import { cancelStripeSubscription } from "@/lib/stripe";

// The Stripe SDK (used to cancel an active subscription on deletion) and the
// Supabase admin API both require the Node runtime, not edge.
export const runtime = "nodejs";

const PROFILE_FIELD_KEYS = new Set([
  "life_and_direction", "approach", "currently_exploring", "worth_raising",
]);

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("users")
    .select("name, avatar_url, display_currency, theme, fingerprint, profile, ai_consent_at")
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

// Property map thumbnails live in this public bucket at `{user_id}/{asset_id}-{theme}.png`
// (see PropertyMap.tsx). They are user-owned and must be purged on account deletion.
const PROPERTY_PHOTOS_BUCKET = "property-photos";
const STORAGE_LIST_PAGE = 100;

// Removes every object under the user's `{userId}/` prefix in the property-photos
// bucket, paging until the folder is empty. Tolerates a missing/empty folder (no
// objects → no-op) and is safe to re-run (removing already-removed paths is a
// no-op). Throws a labelled error on a genuine list/remove failure.
async function purgeUserPropertyPhotos(
  supabase: ReturnType<typeof createServerSupabase>,
  userId: string,
): Promise<void> {
  const storage = supabase.storage.from(PROPERTY_PHOTOS_BUCKET);
  // Defensive cap so a list/remove inconsistency can never loop forever. Each
  // iteration removes the objects it just listed, so the folder strictly shrinks.
  for (let guard = 0; guard < 10_000; guard++) {
    const { data, error } = await storage.list(userId, { limit: STORAGE_LIST_PAGE });
    if (error) throw new Error(`Failed listing storage for ${userId}: ${error.message}`);
    if (!data || data.length === 0) return;

    const paths = data.map((obj) => `${userId}/${obj.name}`);
    const { error: removeError } = await storage.remove(paths);
    if (removeError) throw new Error(`Failed removing storage objects: ${removeError.message}`);

    if (data.length < STORAGE_LIST_PAGE) return; // last (partial) page handled
  }
}

// Permanent, irreversible account deletion. The user id is resolved from the
// session only — never from the request body. First cancels an active Stripe
// (web) subscription so a deleted account is never billed again, then removes the
// user's Storage objects, then every row owned by the user across all tables, then
// the users row, then the auth user itself. Every step is idempotent, so a
// mid-sequence failure can be safely retried while the session (and thus the auth
// user) is still valid — which is why the auth user is deleted LAST. Any step
// failure returns 500 rather than a silent partial success.
//
// Store subscriptions (App Store / Play) cannot be cancelled server-side — only
// the user can, in their store settings — so the delete dialog warns them; see
// src/components/settings/SettingsContent.tsx.
export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userId = user.id;
  const supabase = createServerSupabase();

  try {
    // 1. Stop billing first. A deleted account must never be charged again, so
    // cancel an active Stripe (web) subscription up front. cancelStripeSubscription
    // is idempotent (a missing/already-terminal subscription is a no-op) and throws
    // only on a genuine Stripe failure — in which case we abort the whole deletion
    // and surface a retry, rather than deleting the account and orphaning a live,
    // still-billing subscription. On a retry after a later-step failure the
    // entitlement row may already be gone (getEntitlement → null), so this is skipped.
    const entitlement = await getEntitlement(supabase, userId);
    if (entitlement?.source === "stripe" && entitlement.stripe_subscription_id) {
      await cancelStripeSubscription(entitlement.stripe_subscription_id);
    }

    // 2. Storage — user-owned property-map thumbnails (public bucket).
    await purgeUserPropertyPhotos(supabase, userId);

    // 3. Dependent table rows. Every user-scoped table is listed explicitly (all
    // keyed by user_id). rate_limits is omitted — it has ON DELETE CASCADE to
    // users(id); fx_rates is global and price_index_cache is region-keyed, both
    // intentionally untouched. entitlements also cascades, but is removed
    // explicitly so account deletion provably drops the subscription row.
    const tables = ["messages", "highlights", "goals", "snapshots", "mutations", "assets", "diary_summaries", "vital_snapshots", "scenarios", "entitlements"];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId);
      if (error) throw new Error(`Failed deleting ${table}: ${error.message}`);
    }

    // 4. The users row (cascades rate_limits).
    const { error: userError } = await supabase.from("users").delete().eq("id", userId);
    if (userError) throw new Error(`Failed deleting users row: ${userError.message}`);

    // 5. The auth user LAST — so the session stays valid for a retry if any
    // earlier step failed.
    const { error: authError } = await supabase.auth.admin.deleteUser(userId);
    if (authError) throw new Error(`Failed deleting auth user: ${authError.message}`);

    return NextResponse.json({ ok: true });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "DELETE /api/users/me" } });
    // Surface a clear, non-silent failure so the client knows deletion is
    // incomplete and can retry. The specific failing step is captured to Sentry.
    return NextResponse.json(
      { error: "Account deletion did not complete. Please try again." },
      { status: 500 },
    );
  }
}
