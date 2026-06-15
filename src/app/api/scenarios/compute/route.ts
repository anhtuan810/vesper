import { NextRequest, NextResponse } from "next/server";
import { getAuthUser, createServerSupabase } from "@/lib/supabase";
import { entitledGate } from "@/lib/require-entitled";
import { sanitizeModifications } from "@/lib/scenario/engine";
import { assemblePresent } from "@/lib/scenario/present-assemble";

// POST /api/scenarios/compute
// Applies the client-sent value-based modifications to the user's real assets and
// returns the Current vs Scenario comparison + display currency + FX. Read-only.
export async function POST(req: NextRequest) {
  const user = await getAuthUser(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createServerSupabase();
  const gate = await entitledGate(supabase, user.id);
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const modifications = sanitizeModifications((body as { modifications?: unknown })?.modifications);

  const { comparison, displayCurrency, usdRates } = await assemblePresent(supabase, user.id, modifications);
  return NextResponse.json({ comparison, displayCurrency, usdRates });
}
