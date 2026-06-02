import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

// GET /api/scenarios — list the user's saved scenarios, newest first.
export async function GET(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("scenarios")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: "Failed to load scenarios" }, { status: 500 });

  return NextResponse.json({ scenarios: data ?? [] });
}

// POST /api/scenarios — save a scenario. Writes ONLY a scenarios row; no asset,
// mutation, or snapshot is written (the sandbox is local/derived state).
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: unknown; assets_snapshot?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 200) {
    return NextResponse.json({ error: "name is required (max 200 chars)" }, { status: 400 });
  }
  if (!Array.isArray(body.assets_snapshot)) {
    return NextResponse.json({ error: "assets_snapshot must be an array" }, { status: 400 });
  }

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("scenarios")
    .insert({ user_id: user.id, name, assets_snapshot: body.assets_snapshot })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: "Failed to save scenario" }, { status: 500 });

  return NextResponse.json({ scenario: data });
}
