import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = parseInt(request.nextUrl.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(isNaN(raw) || raw < 1 ? DEFAULT_LIMIT : raw, MAX_LIMIT);

  const supabase = createServerSupabase();

  // Fetch DESC to get the most recent N rows, then reverse for ascending display order.
  const { data, error } = await supabase
    .from("messages")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const messages = (data ?? [])
    .reverse()
    .map(({ role, content }) => ({ role, content }));

  return NextResponse.json({ messages });
}
