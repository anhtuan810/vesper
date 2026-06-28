import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { assembleVerdict } from "@/lib/scenario/decision-verdict";

// POST /api/decisions/verdict { mutation_id, display_currency }
// Retrospective verdict on a past sell/reduce: was letting that stake go a good
// call? Read-only; reuses the counterfactual price engine. Non-eligible decisions
// (not a sell, too recent, no price history) return 200 { eligible: false } so the
// client simply renders nothing — they aren't errors.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  let body: { mutation_id?: unknown; display_currency?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const mutationId = typeof body.mutation_id === "string" ? body.mutation_id : null;
  if (!mutationId) return NextResponse.json({ error: "mutation_id is required" }, { status: 400 });
  const displayCurrency = typeof body.display_currency === "string" ? body.display_currency : "USD";

  const result = await assembleVerdict(supabase, user.id, mutationId, displayCurrency);
  if (!result.ok) return NextResponse.json({ eligible: false });
  return NextResponse.json({ eligible: true, ...result.data });
}
