import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";
import { writeSnapshot } from "@/lib/snapshot";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabase();
  const { data: rows } = await supabase.from("assets").select("user_id");

  const userIds = [...new Set((rows || []).map((r) => r.user_id as string))];

  await Promise.all(userIds.map((userId) => writeSnapshot(userId)));

  return NextResponse.json({ ok: true, users: userIds.length });
}
