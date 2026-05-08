import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase, getAuthUser } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getAuthUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { id } = await params;
    const supabase = createServerSupabase();

    const { data: mutation } = await supabase
      .from("mutations")
      .select("id, user_id")
      .eq("id", id)
      .single();

    if (!mutation || mutation.user_id !== user.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = await req.json();
    const keys = Object.keys(body);
    if (keys.length === 0 || keys.some((k) => k !== "personal_context")) {
      return NextResponse.json(
        { error: "Only personal_context is allowed" },
        { status: 400 }
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("mutations")
      .update({ personal_context: body.personal_context })
      .eq("id", id)
      .select("*")
      .single();

    if (updateError || !updated) {
      console.error("PATCH mutation error:", updateError);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ mutation: updated });
  } catch (err) {
    console.error("PATCH /api/mutations/[id] error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
