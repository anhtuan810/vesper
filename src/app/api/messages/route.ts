import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(isNaN(raw) || raw < 1 ? DEFAULT_LIMIT : raw, MAX_LIMIT);
  const before = request.nextUrl.searchParams.get("before");

  const supabase = createServerSupabase();

  let query = supabase
    .from("messages")
    .select("id, role, content, suggested_replies")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (before) {
    const { data: pivot, error: pivotError } = await supabase
      .from("messages")
      .select("created_at")
      .eq("id", before)
      .eq("user_id", user.id)
      .single();

    if (pivotError || !pivot) {
      return NextResponse.json({ error: "Invalid cursor" }, { status: 400 });
    }

    query = query.lt("created_at", pivot.created_at);
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? [])
    .reverse()
    .map(({ id, role, content, suggested_replies }) => ({ id, role, content, suggested_replies }));

  return NextResponse.json({ messages });
}
