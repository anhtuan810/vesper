import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const user = await getAuthUser(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const { data } = await supabase
    .from("mutations")
    .select("*")
    .eq("user_id", user.id)
    .order("occurred_at", { ascending: false, nullsFirst: false });

  return NextResponse.json(
    { mutations: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
