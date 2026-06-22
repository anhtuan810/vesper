import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { demoExpiredGate } from "@/lib/demo-session";

// GET /api/scenarios/[id] — fetch one saved scenario (user-scoped).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;

  const supabase = createServerSupabase();
  const { data, error } = await supabase
    .from("scenarios")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Failed to load scenario" }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ scenario: data });
}

// DELETE /api/scenarios/[id] — delete one saved scenario (user-scoped).
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Wall an expired demo turn before deleting the saved scenario.
  const demoGate = await demoExpiredGate(createServerSupabase(), user.id);
  if (demoGate) return demoGate;

  const { id } = await params;

  const supabase = createServerSupabase();
  const { error } = await supabase
    .from("scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Failed to delete scenario" }, { status: 500 });

  return NextResponse.json({ ok: true });
}
