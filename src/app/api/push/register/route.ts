import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

// Registers/unregisters this device's APNs push token for the signed-in user.
// Tokens are upserted on (user_id, token) so re-registration is idempotent, and
// deletion is scoped to the caller's own rows.

const TOKEN_RE = /^[a-fA-F0-9]{32,200}$/;

export async function POST(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: unknown; platform?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const platform = body.platform === "ios" ? "ios" : null;
  if (!TOKEN_RE.test(token) || !platform) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("device_tokens")
    .upsert(
      { user_id: user.id, token, platform, updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" }
    );
  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return NextResponse.json({ error: "Invalid token" }, { status: 400 });

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("device_tokens")
    .delete()
    .eq("user_id", user.id)
    .eq("token", token);
  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
