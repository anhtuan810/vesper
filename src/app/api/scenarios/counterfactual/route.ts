import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { assembleCounterfactual } from "@/lib/scenario/counterfactual-assemble";

// POST /api/scenarios/counterfactual { asset_id, range }
// Reconstructs net worth as if a held tradeable had never existed. Read-only.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  let body: { asset_id?: unknown; range?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const assetId = typeof body.asset_id === "string" ? body.asset_id : null;
  if (!assetId) return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  const range = typeof body.range === "string" ? body.range : "All";

  const result = await assembleCounterfactual(supabase, user.id, assetId, range);
  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: result.reason === "not_found" ? 404 : 400 });
  }
  return NextResponse.json(result.data);
}
